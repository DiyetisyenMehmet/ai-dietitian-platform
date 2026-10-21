"""Mask only the approved artwork's outer backing; never redraw the mark.

Development-only: python -m pip install Pillow, then run this file from repo root.
The original JPEG remains untouched. The RGB artwork is resized uniformly; only
rounded outer corners gain alpha. No color replacement or generative editing.
"""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
source = root / 'android/app/src/main/res/drawable-nodpi/diewish_splash_approved.jpg'
target = source.with_name('diewish_splash_rounded.png')
image = Image.open(source).convert('RGBA').resize((512, 512), Image.Resampling.LANCZOS)
# Supersample the mask for smooth edges at every device density.
mask = Image.new('L', (2048, 2048), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 2047, 2047), radius=448, fill=255)
image.putalpha(mask.resize(image.size, Image.Resampling.LANCZOS))
image.save(target, optimize=True)
