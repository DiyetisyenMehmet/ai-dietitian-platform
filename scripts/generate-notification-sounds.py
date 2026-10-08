"""Reproducible original Diewish tones; no recordings or third-party samples."""
import hashlib
import json
import math
from pathlib import Path
import struct
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 22050
TONES = {"diewish_drop": [(0.0, 880, .32), (.18, 1320, .28)],
         "diewish_gentle": [(0.0, 523.25, .6), (.23, 659.25, .6), (.46, 783.99, .6)]}
manifest = {}
for name, notes in TONES.items():
    duration = max(start + length for start, _, length in notes) + .08
    samples = []
    for index in range(math.ceil(duration * RATE)):
        t = index / RATE
        value = 0.0
        for start, frequency, length in notes:
            age = t - start
            if 0 <= age < length:
                envelope = min(age / .018, 1) * math.exp(-age * 6) * min((length - age) / .06, 1)
                value += .20 * envelope * (math.sin(2 * math.pi * frequency * age) + .16 * math.sin(4 * math.pi * frequency * age))
        samples.append(struct.pack("<h", round(max(-.8, min(.8, value)) * 32767)))
    web = ROOT / "frontend/public/audio" / (name + ".wav")
    web.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(web), "wb") as output:
        output.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        output.writeframes(b"".join(samples))
    native = ROOT / "android/app/src/main/res/raw" / web.name
    native.parent.mkdir(parents=True, exist_ok=True)
    native.write_bytes(web.read_bytes())
    manifest[name] = {"sha256": hashlib.sha256(web.read_bytes()).hexdigest(), "sampleRate": RATE, "frames": len(samples), "origin": "Original procedural synthesis; Diewish project asset"}
(ROOT / "frontend/public/audio/manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
