#!/bin/bash
# Renders demo/out/demo-portrait.mp4 and demo/out/demo-16x9.mp4 from tracks/*.json.
set -euo pipefail
cd "$(dirname "$0")"
FF=~/.local/bin/ffmpeg
CLIPS=(IMG_6433 IMG_6432)
export PW_CORE=${PW_CORE:-$(ls -d ~/.npm/_npx/*/node_modules/playwright-core | while read d; do grep -q '"version": "1.63' "$d/package.json" && echo "$d"; done | head -1)}
export CHROME=${CHROME:-"$HOME/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"}
rm -rf work/frames work/shots work/seg work/say
mkdir -p work/frames work/shots work/seg work/say out

field() { python3 -c "import json,sys; print(json.load(open('tracks/$1.json'))['$2'])"; }

for c in "${CLIPS[@]}"; do
  src="$HOME/Documents/Vids/$c 2.MOV"
  s=$(field "$c" start); e=$(field "$c" end); d=$(python3 -c "print(round($e-$s,3))")
  mkdir -p "work/frames/$c"
  $FF -v error -y -ss "$s" -i "$src" -t "$d" -vf fps=30 -q:v 2 "work/frames/$c/%05d.jpg"
  $FF -v error -y -ss "$s" -i "$src" -t "$d" -vn -ac 2 -ar 48000 "work/seg/$c.wav"
done

node render.mjs "${CLIPS[@]}"

ENC=(-c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -color_range tv -r 30 -c:a aac -b:a 192k -ar 48000)
: > work/seg/list.txt
for c in "${CLIPS[@]}"; do
  python3 mix_audio.py "$FF" "$c"
  $FF -v error -y -framerate 30 -i "work/shots/$c/%05d.jpg" -i "work/seg/$c-mix.wav" -map 0:v -map 1:a -vf "scale=in_range=pc:out_range=tv,format=yuv420p" "${ENC[@]}" -shortest "work/seg/$c.mp4"
  echo "file '$c.mp4'" >> work/seg/list.txt
done
$FF -v error -y -f concat -safe 0 -i work/seg/list.txt -c copy -movflags +faststart out/demo-portrait.mp4

$FF -v error -y -loop 1 -framerate 30 -t 2.5 -i work/title.png -f lavfi -t 2.5 -i anullsrc=r=48000:cl=stereo \
  -vf "fade=in:st=0:d=0.4,fade=out:st=2.1:d=0.4,format=yuv420p" "${ENC[@]}" work/seg/title.mp4
$FF -v error -y -i out/demo-portrait.mp4 \
  -vf "scale=-2:1080,pad=1920:1080:(ow-iw)/2:0:color=0x07090d,setsar=1" "${ENC[@]}" work/seg/body-16x9.mp4
$FF -v error -y -i work/seg/title.mp4 -i work/seg/body-16x9.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" "${ENC[@]}" -movflags +faststart out/demo-16x9.mp4
ls -la out

# Contact sheet from the final portrait MP4: for each cue, the contact frame and 0.6 s after the card fires.
mkdir -p work/verify
rm -f work/verify/cs-*.jpg
TIMES=$(python3 -c "
import json
off = 0.0
for c in '${CLIPS[*]}'.split():
    tr = json.load(open(f'tracks/{c}.json'))
    for e in tr['events']:
        print(f\"{off + e['contact_s'] - tr['start']:.2f} {off + e['t'] - tr['start'] + 0.6:.2f}\")
    off += round((tr['end'] - tr['start']) * 30) / 30
")
i=0
for t in $TIMES; do
  i=$((i+1))
  $FF -v error -y -ss "$t" -i out/demo-portrait.mp4 -frames:v 1 -vf "scale=460:-1" "work/verify/cs-$(printf %02d $i).jpg"
done
$FF -v error -y -pattern_type glob -i 'work/verify/cs-*.jpg' -vf "tile=${i}x1:padding=6:color=0x07090d" -frames:v 1 -q:v 3 out/contact-sheet.jpg
echo "contact sheet times (s): $TIMES"
