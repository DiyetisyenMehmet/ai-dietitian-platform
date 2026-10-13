"""Produce separate application assets from the unchanged pilot source package.

Usage: python3 scripts/prepare-mirmir-assets.py /path/to/extracted/pilot
Requires Pillow. No source file is overwritten or merged with another frame.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

source_directory = Path(sys.argv[1])
root = Path(__file__).resolve().parent.parent
output = root / "frontend/public/images/mascots/mirmir"
output.mkdir(parents=True, exist_ok=True)
crop = (64, 168, 1248, 1144)
metadata = {
    "task": "DIEWISH-MASCOT-COLLECTION-A1-MIRMIR-PILOT",
    "sourcePackage": "DIEWISH_MIRMIR_PILOT_REFERANSLAR.zip",
    "commonCrop": list(crop),
    "outputSize": [512, 512],
    "frames": {},
}
for state in ("open", "closed"):
    source = source_directory / f"mirmir-eyes-{state}.png"
    image = Image.open(source).convert("RGBA")
    if image.size != (1254, 1254):
        raise ValueError("Unexpected source dimensions")
    # Discard only practically transparent fringe artifacts in the usage copy.
    image.putalpha(image.getchannel("A").point(lambda alpha: 0 if alpha < 8 else alpha))
    frame = image.crop(crop)
    frame.thumbnail((512, 512), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (512, 512))
    canvas.paste(frame, ((512 - frame.width) // 2, (512 - frame.height) // 2))
    destination = output / f"eyes-{state}.webp"
    canvas.save(destination, "WEBP", lossless=True, method=6)
    metadata["frames"][state] = {
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "outputSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        "bytes": destination.stat().st_size,
    }
(root / "docs/mirmir-pilot-assets.json").write_text(json.dumps(metadata, indent=2) + "\n")
