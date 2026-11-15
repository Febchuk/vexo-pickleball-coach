#!/bin/bash
# Renders demo/out/<name>.mp4 and <name>-sheet.jpg from tracks-hud/<name>.json in the glasses HUD look.
#   ./render-hud.sh hud-1 [hud-2 ...]
set -euo pipefail
cd "$(dirname "$0")"
FF=~/.local/bin/ffmpeg
export PW_CORE=${PW_CORE:-$(ls -d ~/.npm/_npx/*/node_modules/playwright-core | while read d; do grep -q '"version": "1.63' "$d/package.json" && echo "$d"; done | head -1)}
export CHROME=${CHROME:-"$HOME/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"}
mkdir -p out
for name in "$@"; do
  field() { python3 -c "import json; print(json.load(open('tracks-hud/$name.json'))['$1'])"; }
  w=work/hud/$name; rm -rf "$w"; mkdir -p "$w/frames" "$w/cs"
  src="$HOME/Documents/Vids/$(field clip) 2.MOV"
  s=$(field start); d=$(python3 -c "print(round($(field end)-$s,3))")
  $FF -v error -y -ss "$s" -i "$src" -t "$d" -vf fps=30 -q:v 2 "$w/frames/%05d.jpg"
  $FF -v error -y -ss "$s" -i "$src" -t "$d" -vn -ac 2 -ar 48000 "$w/clip.wav"
  node render-hud.mjs "$name"
  python3 mix_audio_hud.py "$FF" "$name"
  $FF -v error -y -framerate 30 -i "$w/shots/%05d.jpg" -i "$w/mix.wav" -map 0:v -map 1:a \
    -vf "scale=1376:1824,scale=in_range=pc:out_range=tv,format=yuv420p" \
    -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -color_range tv -r 30 -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "out/$name.mp4"
  i=0
  for t in $(python3 -c "
import json; tr = json.load(open('tracks-hud/$name.json'))
for e in tr['events']:
    print(f\"{e.get('contact_s', e['t']) - tr['start']:.2f} {e['t'] - tr['start'] + 0.6:.2f}\")"); do
    i=$((i+1)); $FF -v error -y -ss "$t" -i "out/$name.mp4" -frames:v 1 -vf "scale=400:-1" "$w/cs/$(printf %02d $i).jpg"
  done
  $FF -v error -y -pattern_type glob -i "$w/cs/*.jpg" -vf "tile=${i}x1:padding=6:color=0x07090d" -frames:v 1 -q:v 3 "out/$name-sheet.jpg"
  echo "out/$name.mp4 done"
done
