"""Resize the owner's transparent iD PNG; never redraw, mask or recolor it.

Development-only: python -m pip install Pillow, then run this file from repo root.
The original JPEG remains untouched. The supplied RGBA source, including its
alpha, is resized uniformly for the existing Android splash canvas.
"""
from pathlib import Path
from PIL import Image

MARK_SEEDS = ((140, 125), (140, 260), (410, 270), (280, 280), (300, 370))


def generate(source: Path, target: Path) -> None:
    image = Image.open(source).convert('RGBA').resize((512, 512), Image.Resampling.LANCZOS)
    image.save(target, optimize=True)


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[2]
    source = root / 'frontend/public/brands/diewish-id-transparent-approved.png'
    target = root / 'android/app/src/main/res/drawable-nodpi/diewish_splash_rounded.png'
    generate(source, target)
