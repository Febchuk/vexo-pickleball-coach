"""The AI coach: Claude decides what to say after each swing, from that swing and the session so far.

Needs ANTHROPIC_API_KEY (environment or the untracked .env). Without it, or when a call is slow or
fails, the coach falls back to the recorded line for the rule-based cue.
"""
import json
import os
import urllib.request
from pathlib import Path

import anthropic

HERE = Path(__file__).resolve().parent
MODEL = "claude-opus-5-5"
TIMEOUT_S = 6.0
COACH_VOICE = "IKne3meq5aSn9XLyUdCD"    # Charlie, the same voice as the recorded lines

SYSTEM = """You are a pickleball coach speaking into a player's ear through smart glasses, right after each swing.
A motion band on the paddle wrist measured the swing. You get the latest swing and the ones before it this session.

Reply with JSON only, no other text: {"line": "...", "why": "..."}
- line: what you say out loud. At most 6 words, plain spoken English, no numbers. Specific to this swing, encouraging, and varied: never repeat your previous line word for word.
- why: shown on screen under the line. At most 10 words; one number is fine.

How to read the metrics:
- peak_gyro: wrist speed in deg/s. Full swings are about 950-2000; under 600 is soft or slow.
- impact_vs_peak_ms: contact time minus peak-speed time. Above +15 is late contact (meet the ball further in front); -40 to +15 is on time.
- follow_ms: follow-through after contact. Under 120 is cut short.
- cue: the rule-based verdict (late, short, slow or good). Agree with it unless the numbers clearly say otherwise.
Use the history: call out a streak ("third late one in a row") or an improvement ("that's the fix") when there is one."""


def _env(name):
    if os.environ.get(name):
        return os.environ[name]
    env = HERE / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip()
    return None


_client = anthropic.Anthropic(api_key=_env("ANTHROPIC_API_KEY"), timeout=TIMEOUT_S, max_retries=0) if _env("ANTHROPIC_API_KEY") else None


def available():
    return _client is not None


def _brief(event):
    s = event["swing"]
    return {"n": event["n"], "cue": event["cue"], "peak_gyro": round(s["peak_gyro"]),
            "impact_vs_peak_ms": round(s["impact_vs_peak_ms"]), "follow_ms": round(s["follow_ms"]),
            "said": event.get("said")}


def coach_line(history):
    """history: this session's swing events, oldest first, the last being the swing just made.
    Returns {"line", "why"} or None if the AI is unavailable or fails."""
    if not _client:
        return None
    recent = [_brief(e) for e in history[-8:]]
    prompt = f"Latest swing: {json.dumps(recent[-1])}\nEarlier this session (oldest first): {json.dumps(recent[:-1])}"
    try:
        response = _client.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            extra_body={"output_config": {"effort": "low"}},
        )
    except anthropic.APIError as err:
        print(f"AI coach unavailable this swing: {err}")
        return None
    if response.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    try:
        out = json.loads(text[text.index("{"): text.rindex("}") + 1])
        return {"line": str(out["line"]).strip(), "why": str(out.get("why", "")).strip()}
    except (ValueError, KeyError):
        print(f"AI coach reply wasn't JSON: {text[:120]}")
        return None


def speak_file(line, path):
    """Record the line in the coach voice with ElevenLabs' low-latency model. Returns True on success."""
    key = _env("ELEVENLABS_API_KEY")
    if not key:
        return False
    body = json.dumps({"text": line, "model_id": "eleven_flash_v2_5",
                       "voice_settings": {"stability": 0.35, "similarity_boost": 0.8, "style": 0.45}}).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{COACH_VOICE}?output_format=mp3_44100_128", data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            Path(path).write_bytes(r.read())
        return True
    except OSError as err:
        print(f"Coach voice unavailable this swing: {err}")
        return False
