"""Extract the approved iD artwork; never redraw or recolor it.

Development-only: python -m pip install Pillow, then run this file from repo root.
The original JPEG remains untouched. The RGB artwork is resized uniformly;
only alpha changes. Seeded colored components exclude the separate pale tile
and its shadow while retaining the dot, both letters and both leaves.
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

MARK_SEEDS = ((140, 125), (140, 260), (410, 270), (280, 280), (300, 370))


def generate(source: Path, target: Path) -> None:
    image = Image.open(source).convert('RGBA').resize((512, 512), Image.Resampling.LANCZOS)
    red, green, blue, _ = image.split()
    light = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    dark = ImageChops.darker(ImageChops.darker(red, green), blue)
    chroma = ImageChops.subtract(light, dark)
    components = chroma.point(lambda value: 255 if value >= 20 else 0)
    for seed in MARK_SEEDS:
        if components.getpixel(seed) not in (128, 255):
            raise ValueError('Approved artwork seed is missing; do not guess a replacement mask')
        if components.getpixel(seed) == 255:
            ImageDraw.floodfill(components, seed, 128)
    solid = components.point(lambda value: 255 if value == 128 else 0)
    # Keep all selected source pixels opaque; a subpixel feather softens only
    # the outside edge without adding an opaque white outline or filling gaps.
    image.putalpha(ImageChops.lighter(solid, solid.filter(ImageFilter.GaussianBlur(0.4))))
    image.save(target, optimize=True)


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[2]
    source = root / 'android/app/src/main/res/drawable-nodpi/diewish_splash_approved.jpg'
    generate(source, source.with_name('diewish_splash_rounded.png'))
