import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "vexo-open-kit" / "python"))   # the library: a folder in the kit
from vexo_open.sync import Band

BAND = 56                                 # our band number (Vexo-HACK-56)

transport = "sim" if "--sim" in sys.argv else ("serial" if "--usb" in sys.argv else None)
band = Band.connect(BAND, transport=transport) if transport else Band.connect(BAND)
print(f"Connected to {band.name} (number {band.number})")
band.set_led("#00ff00")
band.on("tap", lambda e: print("tap"))
band.on("double-tap", lambda e: print("double-tap"))
band.configure(events=True)               # nothing arrives until you turn it on
print("Tap the band... (10 seconds)")
band.wait(10)
band.disconnect()
