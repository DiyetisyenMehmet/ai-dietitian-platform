"""Create a usage copy from the unchanged, approved Dost PNG. Requires Pillow.

Usage: python3 scripts/prepare-dost-assets.py /path/to/MASKOTLAR-extracted
No crop, alpha cleanup, recoloring or generated animation is applied.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]) / "file_000000006fd08246914408e28b7c792b.png"
source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
if source_sha != "94fd65f8b9158455d631833bd75f707c267cc3c8d811368d95692e481312bd8c":
    raise ValueError("The approved Dost source does not match")
image = Image.open(source).convert("RGBA")
if image.size != (1254, 1254) or image.getchannel("A").getextrema() != (0, 255):
    raise ValueError("Unexpected source size/transparency")
frame = image.resize((512, 512), Image.Resampling.LANCZOS)
destination = root / "frontend/public/images/mascots/dost/still.webp"
destination.parent.mkdir(parents=True, exist_ok=True)
frame.save(destination, "WEBP", lossless=True, method=6)
decoded = Image.open(destination).convert("RGBA")
# WebP may clear RGB values under fully transparent pixels. Compare composited
# pixels and alpha to prove lossless storage of every visible color/edge.
assert frame.getchannel("A").tobytes() == decoded.getchannel("A").tobytes()
for color in ("white", "#102c30"):
    background = Image.new("RGBA", frame.size, color)
    assert Image.alpha_composite(background, frame).tobytes() == Image.alpha_composite(background, decoded).tobytes()
metadata = {
    "task": "DIEWISH-MASCOT-NEXT-CHARACTER-A1", "mascotId": "dost", "name": "Dost",
    "sourceArchive": "MASKOTLAR.zip (7z container)",
    "archiveSha256": "6bf16b6c2f402594807299a8eff8ad59c84dd3ccce2565aeeb3bc6e557f4882c",
    "sourceFile": source.name, "sourceSha256": source_sha, "sourceSize": [1254, 1254],
    "collectionOrder": "Mirmir -> Dost -> Nox (approved original order)",
    "pose": "open eyes", "closedEyeSource": None, "animation": "static; no invented pose",
    "transform": "full canvas resized with LANCZOS; no crop or alpha edits",
    "outputSize": [512, 512], "outputFormat": "lossless WebP RGBA",
    "outputSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
    "outputBytes": destination.stat().st_size,
    "transparentPixels": sum(a == 0 for a in decoded.getchannel("A").tobytes()),
    "partialAlphaPixels": sum(0 < a < 255 for a in decoded.getchannel("A").tobytes()),
    "visibleColorsAndAlphaVerified": True,
}
(root / "docs/dost-assets.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(metadata, ensure_ascii=False))
