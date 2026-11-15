"""Swing detection from the band's motion stream, shared by the recorder and the coach.

Feed every motion sample to SwingDetector.feed(); it returns a Swing when one ends.
All thresholds are guesses until we tune them on recorded swings.
"""
import math
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "vexo-open-kit" / "python"))
from vexo_open.sync import Band

BAND = 56                       # our band number (Vexo-HACK-56)

START_GYRO = 300                # deg/s: rotation faster than this starts a swing
END_GYRO = 120                  # deg/s: below this for END_MS ends it
END_MS = 80
MIN_SWING_MS = 60               # shorter bursts are wrist flicks, not swings
MAX_SWING_MS = 1500


@dataclass
class Swing:
    t_start: float              # band clock, ms
    duration_ms: float
    peak_gyro: float            # deg/s, fastest rotation of the swing
    peak_accel: float           # g, largest |a|
    impact_jerk: float          # g per sample, largest jump in |a|: the ball hitting the paddle
    impact_vs_peak_ms: float    # contact time minus peak-rotation time; positive = contact after peak speed
    follow_ms: float            # time from contact to the end of the swing
    samples: int

    def as_dict(self):
        return {k: round(v, 2) if isinstance(v, float) else v for k, v in asdict(self).items()}


class SwingDetector:
    def __init__(self):
        self.buf = []           # (t, |a|, |g|) of the swing in progress
        self.quiet_since = None

    def feed(self, m):
        a = math.sqrt(m.ax ** 2 + m.ay ** 2 + m.az ** 2)
        g = math.sqrt(m.gx ** 2 + m.gy ** 2 + m.gz ** 2)
        if not self.buf:
            if g > START_GYRO:
                self.buf.append((m.t, a, g))
                self.quiet_since = None
            return None
        self.buf.append((m.t, a, g))
        if g < END_GYRO:
            if self.quiet_since is None:
                self.quiet_since = m.t
            elif m.t - self.quiet_since >= END_MS:
                return self._finish()
        else:
            self.quiet_since = None
        if m.t - self.buf[0][0] > MAX_SWING_MS:
            return self._finish()
        return None

    def _finish(self):
        buf, self.buf, self.quiet_since = self.buf, [], None
        duration = buf[-1][0] - buf[0][0]
        if duration < MIN_SWING_MS or len(buf) < 5:
            return None
        peak_i = max(range(len(buf)), key=lambda i: buf[i][2])
        jerks = [abs(buf[i][1] - buf[i - 1][1]) for i in range(1, len(buf))]
        impact_i = max(range(len(jerks)), key=jerks.__getitem__) + 1
        return Swing(
            t_start=buf[0][0],
            duration_ms=duration,
            peak_gyro=buf[peak_i][2],
            peak_accel=max(x[1] for x in buf),
            impact_jerk=jerks[impact_i - 1],
            impact_vs_peak_ms=buf[impact_i][0] - buf[peak_i][0],
            follow_ms=buf[-1][0] - buf[impact_i][0],
            samples=len(buf),
        )


def connect(argv):
    """Connect to our band (Bluetooth by default, --usb for the cable, --sim for the pretend band)
    and start motion as fast as the link carries with both sensors, at full sensor range."""
    if "--sim" in argv:
        from vexo_open.transports.sim import SimTransport
        band = Band.connect(BAND, transport=SimTransport(BAND, auto_tap=False))
    elif "--usb" in argv:
        band = Band.connect(BAND, transport="serial")
    else:
        band = Band.connect(BAND, auto_reconnect=True)
    band.set_motion(accel_range=16, gyro_range=2000)    # default 2 g clips every real swing
    return band


def start_motion(band):
    band.configure(motion="fastest", sensors="both")
    return band.streams["motion"]


def fake_swing(band, speed=1.0, contact_s=0.17):
    """Pretend band only: play one forehand-like swing (rotation burst plus a contact spike).
    Peak rotation is at 0.15 s, so contact_s below that is early contact and above it is late."""
    def shape(s):
        w = math.sin(math.pi * s / 0.3) if s < 0.3 else 0.0         # 300 ms swing
        spike = 4.0 if contact_s < s < contact_s + 0.005 else 0.0    # contact
        return dict(gz=1200 * speed * w, ax=2.5 * speed * w + spike, az=1.0)
    band.transport.play_motion(shape, seconds=0.45)
