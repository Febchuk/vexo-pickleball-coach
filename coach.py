"""The live coach: band swings -> a cue (band light + voice) -> the overlay page.

    python3 coach.py            band 56 over Bluetooth
    python3 coach.py --usb      over the cable
    python3 coach.py --sim      pretend band; swing from the page's buttons or the keyboard
    add --mute to skip the spoken cues, --port N to serve on another port

Then open http://127.0.0.1:8765 (the overlay over a POV clip).
"""
import json
import queue
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable

import ai_coach
import swing
from vexo_open.transport import VexoError

PORT = 8765
WEB = Path(__file__).resolve().parent / "web"
LED_IDLE = ("#ffffff", 0.3)
LED_FLASH_S = 0.6
VOICE_GAP_S = 1.2               # don't talk over the last cue

LATE_MS = 15                    # contact more than this after peak speed is late
SHORT_FOLLOW_MS = 120
SLOW_GYRO = 600                 # deg/s


@dataclass(frozen=True)
class Cue:
    key: str
    color: str                  # the band's flash and the overlay's accent
    line: str                   # spoken through the glasses and shown on the overlay
    test: Callable[[swing.Swing], bool]


# First match wins; "good" catches everything else. Thresholds are guesses until tuned on real swings.
CUES = [
    Cue("late", "#ffb000", "Meet it in front", lambda s: s.impact_vs_peak_ms > LATE_MS),
    Cue("short", "#ffb000", "Finish the swing", lambda s: s.follow_ms < SHORT_FOLLOW_MS),
    Cue("slow", "#ffb000", "Swing through it", lambda s: s.peak_gyro < SLOW_GYRO),
    Cue("good", "#00ff40", "Nice. Same again.", lambda s: True),
]


def judge(s: swing.Swing) -> Cue:
    return next(c for c in CUES if c.test(s))


# ---------------------------------------------------------------------------------------------
# Events out to every open overlay page, as server-sent events.

class Hub:
    """Fans events out to every open page. A page that opens late first gets the status and
    this session's swings again, marked "replay", so it can rebuild its history without
    animating or speaking them."""

    def __init__(self):
        self.clients: list[queue.Queue] = []
        self.lock = threading.Lock()
        self.last_status = None
        self.swings: list[dict] = []

    def publish(self, event: dict):
        with self.lock:
            if event["type"] == "status":
                self.last_status = event
            elif event["type"] == "swing":
                self.swings.append(event)
            for q in self.clients:
                q.put(event)

    def subscribe(self) -> queue.Queue:
        q = queue.Queue()
        with self.lock:
            if self.last_status:
                q.put(self.last_status)
            for event in self.swings:
                q.put({**event, "replay": True})
            self.clients.append(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            self.clients.remove(q)


hub = Hub()
sim_swings: queue.Queue = queue.Queue()    # requests from the page to play a pretend swing


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path != "/events":
            return super().do_GET()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        q = hub.subscribe()
        try:
            while True:
                try:
                    event = q.get(timeout=15)
                    self.wfile.write(f"data: {json.dumps(event)}\n\n".encode())
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            hub.unsubscribe(q)

    def do_POST(self):
        if self.path.startswith("/sim/"):
            sim_swings.put(self.path.removeprefix("/sim/"))
            self.send_response(204)
            self.end_headers()
        else:
            self.send_error(404)


# ---------------------------------------------------------------------------------------------
# Voice: the coach voice recorded by render_voice.py (voice/<cue>.mp3), else macOS `say`.
# Plays through whatever is the audio output, e.g. the glasses.

VOICE_DIR = Path(__file__).resolve().parent / "voice"


class Voice:
    def __init__(self):
        self.proc = None
        self.last = 0.0

    def say(self, cue: Cue):
        if self.proc and self.proc.poll() is None:
            return
        if time.time() - self.last < VOICE_GAP_S:
            return
        recorded = VOICE_DIR / f"{cue.key}.mp3"
        cmd = ["afplay", str(recorded)] if recorded.exists() else ["say", "-r", "210", cue.line]
        self.proc = subprocess.Popen(cmd)
        self.last = time.time()

    def play(self, path):
        if self.proc and self.proc.poll() is None:
            return
        self.proc = subprocess.Popen(["afplay", str(path)])
        self.last = time.time()


AI_STALE_S = 4.0                # an AI line that arrives later than this after the swing isn't spoken
AI_AUDIO = Path(__file__).resolve().parent / "data" / "ai-voice"


def ai_cue(event, history, cue, voice, latest, speak):
    """Runs beside the band loop: Claude picks the words, ElevenLabs says them, the overlays show them.
    Falls back to the recorded line when the AI is slow or unavailable."""
    started = time.time()
    said = ai_coach.coach_line(history)
    fresh = latest[0] == event["n"] and time.time() - started < AI_STALE_S
    if not said or not fresh:
        if speak and latest[0] == event["n"]:
            voice.say(cue)
        return
    event["said"] = said["line"]
    hub.publish({"type": "coach", "n": event["n"], "line": said["line"], "why": said["why"], "source": "ai"})
    print(f"    AI coach: {said['line']}  ({said['why']})  {time.time() - started:.1f} s")
    if speak:
        AI_AUDIO.mkdir(parents=True, exist_ok=True)
        path = AI_AUDIO / f"{event['n']}.mp3"
        if ai_coach.speak_file(said["line"], path) and latest[0] == event["n"]:
            voice.play(path)
        else:
            voice.say(cue)


# Pretend swings for --sim, by the cue they should produce.
SIM = {
    "good": dict(speed=1.0, contact_s=0.148),
    "late": dict(speed=1.0, contact_s=0.19),
    "slow": dict(speed=0.4, contact_s=0.148),
}


def set_led(band, color, brightness=1.0):
    """A dropped link makes every command fail until auto-reconnect is back; the light can wait."""
    try:
        band.set_led(color, brightness=brightness)
    except VexoError:
        pass


def main(argv):
    port = int(argv[argv.index("--port") + 1]) if "--port" in argv else PORT
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Overlay at http://127.0.0.1:{port}")

    while True:
        try:
            band = swing.connect(argv)
            break
        except VexoError as err:
            print(f"Can't reach band 56 yet ({err}). Double-tap it so it blinks blue; retrying...")
            time.sleep(2)
    samples = queue.Queue()
    band.on("motion", samples.put)          # the handler only collects; work happens below
    rate = swing.start_motion(band)
    set_led(band, *LED_IDLE)
    band.on("reconnecting", lambda e: print("Band link dropped, reconnecting... (keep it within a few metres)"))
    band.on("reconnected", lambda e: print(f"Band back after {e.seconds:.0f} s"))
    hub.publish({"type": "status", "band": band.name, "number": band.number, "rate": rate, "sim": "--sim" in argv})
    print(f"Connected to {band.name}, motion at {rate}/s. Swing!")

    detector = swing.SwingDetector()
    voice = Voice()
    latest = [0]                # the newest swing number, so a slow AI reply for an older swing is dropped
    print("AI coach:", "on (Claude writes the lines)" if ai_coach.available() else "off (no ANTHROPIC_API_KEY; recorded lines)")
    led_reset_at = None
    count = 0
    try:
        while True:
            if "--sim" in argv:
                while not sim_swings.empty():
                    swing.fake_swing(band, **SIM.get(sim_swings.get(), SIM["good"]))
            band.wait(0.02)
            while not samples.empty():
                s = detector.feed(samples.get())
                if not s:
                    continue
                count += 1
                cue = judge(s)
                set_led(band, cue.color)
                led_reset_at = time.time() + LED_FLASH_S
                event = {"type": "swing", "n": count, "cue": cue.key, "color": cue.color, "line": cue.line, "swing": s.as_dict()}
                hub.publish(event)
                latest[0] = count
                speak = "--mute" not in argv
                if ai_coach.available():
                    threading.Thread(target=ai_cue, args=(event, list(hub.swings), cue, voice, latest, speak), daemon=True).start()
                elif speak:
                    voice.say(cue)
                print(f"#{count:2d} {cue.key:5s}  speed {s.peak_gyro:5.0f} deg/s  contact {s.impact_vs_peak_ms:+4.0f} ms  follow {s.follow_ms:4.0f} ms")
            if led_reset_at and time.time() > led_reset_at:
                set_led(band, *LED_IDLE)
                led_reset_at = None
    except KeyboardInterrupt:
        pass
    finally:
        band.disconnect()
        server.shutdown()


if __name__ == "__main__":
    main(sys.argv)
