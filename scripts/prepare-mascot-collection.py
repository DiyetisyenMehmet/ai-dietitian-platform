"""Prepare usage copies of every source character, without changing the archive.

Usage: python3 scripts/prepare-mascot-collection.py /path/to/extracted/archive
Mirmir and Dost application assets are retained byte-for-byte. Requires Pillow.
"""
import hashlib
import io
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
sources = Path(sys.argv[1])
inventory = json.loads((root / "docs/mascot-source-inventory.json").read_text())
expected = {entry["file"]: entry for entry in inventory["sources"]}
for name, entry in expected.items():
    if hashlib.sha256((sources / name).read_bytes()).hexdigest() != entry["sha256"]:
        raise ValueError("Original source changed: " + name)

# Labels for the two unnamed source designs are descriptive, not invented identities.
characters = [
    ("diewish-robot", "Diewish Robot", ["file_00000000a6708210ae66430aed635189.png"]),
    ("minis", "Miniş", ["file_00000000890c82109efb2f3269725fab.png"]),
    ("bilge", "Bilge", ["file_0000000077c08246b5b48ad6a43e9372.png"]),
    ("enerjik", "Enerjik", ["file_0000000090f48211b2e11b5ba20fb481.png"]),
    ("lina", "Lina", ["file_00000000d9048210972dec14aca4624d.png", "file_000000004d8c81f49fef462ab45e3594.png"]),
    ("bulut", "Bulut", ["file_00000000031481f49d1222c9e98507df.png", "file_0000000022e0821092db0d8392fd8a18.png"]),
    ("yesil-damla", "Yeşil Damla", ["file_00000000ec088210bff54814dec732ca.png"]),
    ("minik-bulut", "Minik Bulut", ["file_00000000b60081f483c62d9dfcbf325b.png"]),
    ("mirmir", "Mırmır", ["file_000000005a3881f4b83e3ffb65ea21b5.png", "file_0000000078b0821084da22629ac2ddf4.png"]),
    ("dost", "Dost", ["file_000000006fd08246914408e28b7c792b.png"]),
    ("nox", "Nox", ["diewish-mascot-10-nox.png"]),
    ("fit", "Fit", ["file_00000000148c81f49b2b5dfbb8f5f1a8.png"]),
    ("guclu", "Güçlü", ["file_00000000a47481f4b11a330c824d2eab.png"]),
    ("tombis", "Tombiş", ["diewish-mascot-10-tombis (1).png"]),
    ("mini-robot", "Mini Robot", ["file_00000000cb1881f48b06d1e32b225795.png"]),
]
records = []
for identity, label, files in characters:
    record = {"id": identity, "label": label, "sourceFiles": files,
              "sourceSha256": [expected[f]["sha256"] for f in files], "frames": []}
    if identity in ("mirmir", "dost"):
        record["retainedExistingAssets"] = True
        records.append(record)
        continue
    frames = []
    for file in files:
        source = Image.open(sources / file).convert("RGBA")
        if identity == "minik-bulut":
            if source.size != (1774, 887):
                raise ValueError("Unexpected two-pose sheet size")
            frames.extend([source.crop((0, 0, 887, 887)), source.crop((887, 0, 1774, 887))])
        else:
            frames.append(source)
    for index, image in enumerate(frames):
        frame = image.resize((512, 512), Image.Resampling.LANCZOS)
        filename = "still.webp" if index == 0 else "eyes-closed.webp"
        output = root / f"frontend/public/images/mascots/{identity}/{filename}"
        output.parent.mkdir(parents=True, exist_ok=True)
        encoded = io.BytesIO()
        frame.save(encoded, "WEBP", lossless=True, method=6)
        encoded_bytes = encoded.getvalue()
        temporary = output.with_suffix(".webp.tmp")
        temporary.write_bytes(encoded_bytes)
        temporary.replace(output)
        decoded = Image.open(io.BytesIO(encoded_bytes)).convert("RGBA")
        assert decoded.getchannel("A").tobytes() == frame.getchannel("A").tobytes()
        for color in ("#f4fbff", "#102c30"):
            bg = Image.new("RGBA", frame.size, color)
            assert Image.alpha_composite(bg, decoded).tobytes() == Image.alpha_composite(bg, frame).tobytes()
        record["frames"].append({"path": str(output.relative_to(root)), "bytes": output.stat().st_size,
                                 "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                                 "transparentPixels": decoded.getchannel("A").tobytes().count(0)})
    record["animation"] = "original blink pair" if identity in ("lina", "bulut") else "static original pose"
    if identity == "minik-bulut":
        record["note"] = "Both original sheet poses retained; second pose changes gestures, so no forced blink."
    records.append(record)
manifest = {"archiveSha256": inventory["archiveSha256"], "sourcePngCount": 18,
            "originalCharacterCount": len(records), "legacyClassicRetained": True,
            "descriptiveLabels": ["yesil-damla", "minik-bulut"],
            "missingFromArchive": ["Pofi dinosaur reference", "Mini Dino reference"],
            "sourceImagesChanged": False, "characters": records}
(root / "docs/mascot-collection-assets.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"characters": len(records), "generatedBytes": sum(f["bytes"] for r in records for f in r["frames"])}))
