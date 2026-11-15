"""Record each cue line once with ElevenLabs, so the coach plays a file instead of waiting on speech.

    python3 render_voice.py                 the default coach voice
    python3 render_voice.py <voice_id>      another voice from your ElevenLabs list

Reads ELEVENLABS_API_KEY from the environment or the untracked .env next to this file.
Writes voice/<cue>.mp3 for every cue in coach.CUES.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

from coach import CUES

HERE = Path(__file__).resolve().parent
COACH_VOICE = "IKne3meq5aSn9XLyUdCD"    # Charlie: deep, confident, energetic


def api_key():
    if os.environ.get("ELEVENLABS_API_KEY"):
        return os.environ["ELEVENLABS_API_KEY"]
    for line in (HERE / ".env").read_text().splitlines():
        if line.startswith("ELEVENLABS_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("Set ELEVENLABS_API_KEY or put it in .env")


def render(voice_id, text, key):
    body = json.dumps({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.35, "similarity_boost": 0.8, "style": 0.45, "use_speaker_boost": True},
    }).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


if __name__ == "__main__":
    voice_id = sys.argv[1] if len(sys.argv) > 1 else COACH_VOICE
    key = api_key()
    out = HERE / "voice"
    out.mkdir(exist_ok=True)
    for cue in CUES:
        (out / f"{cue.key}.mp3").write_bytes(render(voice_id, cue.line, key))
        print(f"voice/{cue.key}.mp3  \"{cue.line}\"")
