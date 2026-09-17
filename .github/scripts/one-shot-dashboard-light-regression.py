from pathlib import Path
from PIL import Image, ImageFilter
import cv2
import numpy as np
import re

root = Path('.')
refs = root / 'frontend/public/images/dashboard/references'


def build_patch(source_name, output_name, patch_box, dark_roi):
    source_path = refs / source_name
    image = Image.open(source_path).convert('RGB')
    arr = np.array(image)
    h, w, _ = arr.shape
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    rx1, ry1, rx2, ry2 = dark_roi

    dark = (
        (r < 135)
        & (g < 145)
        & (b < 185)
        & ((b.astype(int) - r.astype(int)) > 8)
    )
    arrow_mask = np.zeros((h, w), np.uint8)
    arrow_mask[ry1:ry2, rx1:rx2] = (
        dark[ry1:ry2, rx1:rx2] * 255
    ).astype(np.uint8)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    arrow_mask = cv2.dilate(arrow_mask, kernel, iterations=1)

    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    cleaned = cv2.inpaint(bgr, arrow_mask, 5, cv2.INPAINT_TELEA)
    cleaned_rgb = Image.fromarray(cv2.cvtColor(cleaned, cv2.COLOR_BGR2RGB))

    feather = Image.fromarray(arrow_mask).filter(ImageFilter.GaussianBlur(radius=3.5))
    x1, y1, x2, y2 = patch_box
    patch_rgb = cleaned_rgb.crop(patch_box)
    patch_alpha = feather.crop(patch_box)
    patch = Image.new('RGBA', patch_rgb.size)
    patch.paste(patch_rgb, (0, 0))
    patch.putalpha(patch_alpha)
    patch.save(refs / output_name, optimize=True)


build_patch(
    'food-light-final.png',
    'food-chevron-clean.png',
    (1495, 145, 1590, 260),
    (1510, 150, 1585, 255),
)
build_patch(
    'blood-light-final.png',
    'blood-chevron-clean.png',
    (1495, 175, 1585, 290),
    (1508, 180, 1575, 285),
)

feature_path = root / 'frontend/src/presentation/components/dashboard/dashboard-feature-links.tsx'
feature_text = feature_path.read_text(encoding='utf-8')
replacement = r'''function ReferenceChevronOverlay({ tone }: { tone: Feature["tone"] }) {
  const patch =
    tone === "blood"
      ? {
          src: "/images/dashboard/references/blood-chevron-clean.png",
          left: 1495,
          top: 175,
          width: 90,
          height: 115,
          sourceWidth: 1603,
          sourceHeight: 460,
        }
      : {
          src: "/images/dashboard/references/food-chevron-clean.png",
          left: 1495,
          top: 145,
          width: 95,
          height: 115,
          sourceWidth: 1603,
          sourceHeight: 400,
        };

  return (
    <>
      <Image
        src={patch.src}
        alt=""
        width={patch.width}
        height={patch.height}
        unoptimized
        draggable={false}
        className="pointer-events-none absolute z-20 select-none"
        style={{
          left: `${(patch.left / patch.sourceWidth) * 100}%`,
          top: `${(patch.top / patch.sourceHeight) * 100}%`,
          width: `${(patch.width / patch.sourceWidth) * 100}%`,
          height: `${(patch.height / patch.sourceHeight) * 100}%`,
        }}
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute right-[2.2cqw] top-1/2 z-30 -translate-y-1/2 bg-transparent text-[#29425f]"
        aria-hidden="true"
      >
        <Chevron />
      </span>
    </>
  );
}

function ProgressIcon()'''

feature_text, count = re.subn(
    r'function ReferenceChevronOverlay\(\{ tone \}: \{ tone: Feature\["tone"\] \} \) \{.*?\n\}\n\nfunction ProgressIcon\(\)',
    replacement,
    feature_text,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'Expected one ReferenceChevronOverlay block, replaced {count}')

feature_text = feature_text.replace(
    ' * without optimizer recompression; only the embedded reference chevron area\n'
    ' * is softly neutralized so all three cards can share one live Chevron.\n',
    ' * without optimizer recompression. A feathered, artwork-matched cleanup layer\n'
    ' * removes only the embedded chevron strokes; the shared live Chevron itself has\n'
    ' * a fully transparent background, so no rectangular panel is introduced.\n',
)
feature_path.write_text(feature_text, encoding='utf-8')

banner_path = root / 'frontend/src/presentation/components/dashboard/dashboard-ai-banner.tsx'
banner = banner_path.read_text(encoding='utf-8')
banner = banner.replace(
    'function DiewishMascot() {',
    'function DiewishMascot({ refinedLeaf = false }: { refinedLeaf?: boolean } = {}) {',
    1,
)

old_leaf = '''        <span className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2">
          <span className="absolute left-0 top-1 h-2 w-3 rotate-[-28deg] rounded-full bg-emerald-500" />
          <span className="absolute right-0 top-0 h-2 w-3 rotate-[30deg] rounded-full bg-emerald-400" />
          <span className="absolute left-1/2 top-2 h-2 w-0.5 -translate-x-1/2 bg-emerald-600" />
        </span>'''

refined_leaf = '''        {refinedLeaf ? (
          <span className="absolute -top-[13px] left-1/2 h-[22px] w-[26px] -translate-x-1/2" aria-hidden="true">
            <svg viewBox="0 0 32 28" className="h-full w-full overflow-visible" fill="none">
              <defs>
                <linearGradient id="diewishLeafLeft" x1="5" y1="3" x2="16" y2="13" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#5EE0AE" />
                  <stop offset="1" stopColor="#149A73" />
                </linearGradient>
                <linearGradient id="diewishLeafRight" x1="27" y1="2" x2="16" y2="12" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#70E8B8" />
                  <stop offset="1" stopColor="#0D8F69" />
                </linearGradient>
              </defs>
              <path d="M16 26C16.2 20.7 15.8 15.5 16.3 10.2" stroke="#168D69" strokeWidth="2" strokeLinecap="round" />
              <path d="M15.8 11.6C11.2 12.1 6.6 9.4 5.1 4.1C10.2 2.8 14.9 5.9 15.8 11.6Z" fill="url(#diewishLeafLeft)" />
              <path d="M16.4 9.9C17.7 5.2 21.9 2.1 27.1 2.9C26.3 8 22.1 11.2 16.4 9.9Z" fill="url(#diewishLeafRight)" />
              <path d="M7.1 5.2C9.7 6.8 12.1 8.5 14.7 10.6" stroke="#D8FFF0" strokeOpacity=".58" strokeWidth=".8" strokeLinecap="round" />
              <path d="M25.2 4.2C22.7 5.6 20.4 7.2 17.5 9.1" stroke="#D8FFF0" strokeOpacity=".55" strokeWidth=".8" strokeLinecap="round" />
              <path d="M10.1 6.9L9.5 9.2M22.5 6.1L23.2 8" stroke="#0B7659" strokeOpacity=".45" strokeWidth=".7" strokeLinecap="round" />
            </svg>
          </span>
        ) : (
          <span className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2">
            <span className="absolute left-0 top-1 h-2 w-3 rotate-[-28deg] rounded-full bg-emerald-500" />
            <span className="absolute right-0 top-0 h-2 w-3 rotate-[30deg] rounded-full bg-emerald-400" />
            <span className="absolute left-1/2 top-2 h-2 w-0.5 -translate-x-1/2 bg-emerald-600" />
          </span>
        )}'''

if old_leaf not in banner:
    raise SystemExit('Original mascot leaf block not found')
banner = banner.replace(old_leaf, refined_leaf, 1)
banner = banner.replace('<DiewishMascot />', '<DiewishMascot refinedLeaf />', 1)
banner_path.write_text(banner, encoding='utf-8')
