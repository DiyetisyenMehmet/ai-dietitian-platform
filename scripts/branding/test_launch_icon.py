"""Pixel-level checks for the native-only approved artwork cutout."""
import hashlib
from pathlib import Path
import tempfile
import unittest

from PIL import Image
from generate_launch_icon import generate, MARK_SEEDS

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'frontend/public/brands/diewish-id-transparent-approved.png'
TARGET = ROOT / 'android/app/src/main/res/drawable-nodpi/diewish_splash_rounded.png'


class LaunchIconTest(unittest.TestCase):
    def test_supplied_rgba_icon_is_byte_identical(self):
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                         '37801950b8804dbf581a4806d0fff42e7a00a301f38361686cbed96b3127d252')

    def test_dark_wordmark_preserves_approved_rgba_crop(self):
        image = Image.open(ROOT / 'frontend/public/brands/diewish-wordmark-dark-approved.png')
        self.assertEqual(image.mode, 'RGBA')
        self.assertEqual(image.size, (993, 206))
        # Hash of the owner's (131, 50, 1124, 256) crop: no retained pixel changes.
        self.assertEqual(hashlib.sha256(image.tobytes()).hexdigest(),
                         '83cb26b63127eeac51e66ebbcac2bbaa707f0f0cc17a559506203b55dc77327b')

    def test_source_rgb_and_geometry_are_unchanged(self):
        source = Image.open(SOURCE).convert('RGBA').resize((512, 512), Image.Resampling.LANCZOS)
        cutout = Image.open(TARGET)
        self.assertEqual(cutout.size, (512, 512))
        self.assertEqual(source.tobytes(), cutout.tobytes())

    def test_tile_edges_and_negative_space_are_transparent(self):
        alpha = Image.open(TARGET).getchannel('A')
        for point in ((0, 0), (511, 511), (48, 256), (470, 256), (256, 48), (256, 470), (255, 100)):
            with self.subTest(point=point):
                self.assertEqual(alpha.getpixel(point), 0)

    def test_dot_letters_and_leaf_details_remain_opaque(self):
        alpha = Image.open(TARGET).getchannel('A')
        for point in MARK_SEEDS:
            with self.subTest(point=point):
                self.assertEqual(alpha.getpixel(point), 255)

    def test_reproducible_cutout_never_writes_the_original(self):
        original_hash = hashlib.sha256(SOURCE.read_bytes()).digest()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'cutout.png'
            generate(SOURCE, path)
            self.assertEqual(Image.open(path).tobytes(), Image.open(TARGET).tobytes())
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).digest(), original_hash)


if __name__ == '__main__':
    unittest.main()
