# Vexo Pickleball Coach

Real-time pickleball coaching from a Vexo motion band (swing feedback by light and voice) and Meta glasses (POV video). Built at VexoHacks @ YC, Nov 14 2026.

## Run it

```sh
git clone --recurse-submodules <this repo>
cd vexo-pickleball-coach
pip3 install bleak pyserial    # what the kit's Python library needs

python3 coach.py --sim      # pretend band: buttons and keys 1/2/3 on the page swing it
python3 coach.py            # band 56 over Bluetooth (double-tap it first)
python3 coach.py --usb      # over the cable
# add --mute to skip the spoken cues
```

Three pages, all fed live by the band:

- http://127.0.0.1:8765/hud.html, the glasses view (HUD over the glasses' feed or a clip)
- http://127.0.0.1:8765/app/, the phone companion app (Live, Me, Players, Recap; open it at phone width)
- http://127.0.0.1:8765, the glass overlay

The glasses view and the glass overlay plays a POV clip, or the glasses' live feed: put the glasses on a WhatsApp video call to a second account on this laptop, then pick "Glasses · share the call window". Press H to hide the panel.

## What's where

| File | What it does |
| --- | --- |
| `coach.py` | The live loop: band motion → swing → cue (band light + voice) → events to the overlay (server-sent events on `/events`). Cue rules are the `CUES` table at the top. |
| `swing.py` | Swing detection from the motion stream, and the connect helper. |
| `record_swings.py` | Record labelled swings to `data/` for tuning the thresholds. |
| `render_voice.py` | Records each cue line with ElevenLabs into `voice/`. Needs `ELEVENLABS_API_KEY` in your environment or an untracked `.env`. |
| `web/hud.html` | The glasses view: cue banner, last-swing timing, band light, connection status. |
| `web/app/index.html` | The phone companion app. Live and Me use real swings; ratings, players and recap are sample data, marked SAMPLE. |
| `web/index.html` | The glass overlay page. |
| `demo/` | Renders the demo video from recorded clips: `demo/render.sh`. |
| `ui/` | Avatar sprites, ray-traced with the engine from Nomen (`ui/engine/`). `npx -y tsx ui/bake.ts`. |
| `vexo-open-kit/` | The Vexo kit, as a git submodule. Don't edit it. |

Keys never go in the repo: use environment variables or `.env` (ignored).
