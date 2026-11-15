"""Record labelled swings so we can pick the coach's thresholds from real numbers.

    python3 record_swings.py good            swing well for 30 s
    python3 record_swings.py late --seconds 45
    python3 record_swings.py good --usb      over the cable
    python3 record_swings.py good --sim      pretend band, plays fake swings

Appends one line per swing to data/swings.jsonl and the raw samples to data/raw-<label>-<time>.csv.
"""
import csv
import json
import queue
import sys
import time
from pathlib import Path

import swing

seconds = float(sys.argv[sys.argv.index("--seconds") + 1]) if "--seconds" in sys.argv else 30
args = [a for a in sys.argv[1:] if not a.startswith("--") and a != str(sys.argv[sys.argv.index("--seconds") + 1] if "--seconds" in sys.argv else "")]
label = args[0] if args else "unlabelled"

data = Path(__file__).resolve().parent / "data"
data.mkdir(exist_ok=True)
raw_path = data / f"raw-{label}-{time.strftime('%H%M%S')}.csv"

samples = queue.Queue()
band = swing.connect(sys.argv)
band.on("motion", samples.put)          # the handler only collects; work happens below
rate = swing.start_motion(band)
band.set_led("#ffffff", brightness=0.3)
print(f"Connected to {band.name}, motion at {rate}/s. Recording '{label}' for {seconds:.0f} s. Swing!")

detector = swing.SwingDetector()
count = 0
end = time.time() + seconds
next_fake = time.time() + 1
led_reset_at = None
with open(raw_path, "w", newline="") as raw, open(data / "swings.jsonl", "a") as out:
    w = csv.writer(raw)
    w.writerow(["t", "n", "ax", "ay", "az", "gx", "gy", "gz"])
    while time.time() < end:
        if "--sim" in sys.argv and time.time() > next_fake:
            swing.fake_swing(band)
            next_fake = time.time() + 1.5
        band.wait(0.05)
        while not samples.empty():
            m = samples.get()
            w.writerow([round(m.t, 2), m.n, m.ax, m.ay, m.az, m.gx, m.gy, m.gz])
            s = detector.feed(m)
            if s:
                count += 1
                row = {"label": label, **s.as_dict()}
                out.write(json.dumps(row) + "\n")
                print(f"#{count:2d}  speed {s.peak_gyro:6.0f} deg/s  accel {s.peak_accel:5.2f} g  "
                      f"contact {s.impact_vs_peak_ms:+5.0f} ms vs peak  follow {s.follow_ms:4.0f} ms  "
                      f"len {s.duration_ms:4.0f} ms")
                band.set_led("#00ff00")
                led_reset_at = time.time() + 0.4
        if led_reset_at and time.time() > led_reset_at:
            band.set_led("#ffffff", brightness=0.3)
            led_reset_at = None

band.disconnect()
print(f"{count} swings saved to data/swings.jsonl, raw samples in {raw_path.relative_to(raw_path.parent.parent)}")
