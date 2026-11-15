import json, subprocess, sys

ff, name = sys.argv[1], sys.argv[2]
tr = json.load(open(f"tracks-hud/{name}.json"))
w = f"work/hud/{name}"
inputs = ["-i", f"{w}/clip.wav"]
filters = ["[0:a]volume=0.8[a0]"]
for i, ev in enumerate(tr["events"], 1):
    inputs += ["-i", f"voice-hud/{ev['voice']}.mp3" if ev["type"] == "tactic" else f"../voice/{ev['cue']}.mp3"]
    ms = round((ev["t"] - tr["start"]) * 1000)
    filters.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,volume=1.8,adelay={ms}|{ms}[s{i}]")
n = len(tr["events"])
mix = "[a0]" + "".join(f"[s{i}]" for i in range(1, n + 1)) + f"amix=inputs={n + 1}:normalize=0:duration=first,alimiter=limit=0.95[aout]"
subprocess.run([ff, "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters + [mix]), "-map", "[aout]", "-ar", "48000", f"{w}/mix.wav"], check=True)
