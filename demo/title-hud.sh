#!/bin/bash
# 16:9 cut of one HUD video with the Vexo Coach title card: ./title-hud.sh hud-1
set -euo pipefail
cd "$(dirname "$0")"
FF=~/.local/bin/ffmpeg
name=$1; w=work/hud/$name
export PW_CORE=${PW_CORE:-$(ls -d ~/.npm/_npx/*/node_modules/playwright-core | while read d; do grep -q '"version": "1.63' "$d/package.json" && echo "$d"; done | head -1)}
export CHROME=${CHROME:-"$HOME/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"}
node --input-type=module -e "
import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)(process.env.PW_CORE);
const b = await chromium.launch({ executablePath: process.env.CHROME });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL('$PWD/title.html').href);
await p.evaluate(() => Promise.all(['400 36px Geist', '700 132px Geist'].map((f) => document.fonts.load(f))));
await p.screenshot({ path: '$w/title.png' }); await b.close();"
ENC=(-c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -color_range tv -r 30 -c:a aac -b:a 192k -ar 48000)
$FF -v error -y -loop 1 -framerate 30 -t 2.5 -i "$w/title.png" -f lavfi -t 2.5 -i anullsrc=r=48000:cl=stereo \
  -vf "fade=in:st=0:d=0.4,fade=out:st=2.1:d=0.4,format=yuv420p" "${ENC[@]}" "$w/title.mp4"
$FF -v error -y -i "out/$name.mp4" -vf "scale=-2:1080,pad=1920:1080:(ow-iw)/2:0:color=0x07090d,setsar=1" "${ENC[@]}" "$w/body-16x9.mp4"
$FF -v error -y -i "$w/title.mp4" -i "$w/body-16x9.mp4" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" "${ENC[@]}" -movflags +faststart "out/$name-16x9.mp4"
echo "out/$name-16x9.mp4 done"
