export type DashboardLiveFeatureCardKind = "food" | "progress";
export type DashboardLiveFeatureCardLocale = "tr" | "en";
export type DashboardLiveFeatureCardTheme = "light" | "dark";

export const DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX = {
  width: 1536,
  height: 512,
} as const;

export const DASHBOARD_LIVE_FEATURE_CARD_ASPECT =
  `${DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.width} / ${DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.height}`;

export const DASHBOARD_FEATURE_CARD_FRAME_ASPECT = "21 / 5";

export const DASHBOARD_LIVE_FEATURE_CARD_BASE = {
  food: {
    light: "/images/dashboard/food-card-base-light.png",
    dark: "/images/dashboard/food-card-base-dark.png",
  },
  progress: {
    light: "/images/dashboard/progress-card-base-light.png",
    dark: "/images/dashboard/progress-card-base-dark.png",
  },
} as const;

/**
 * Crop only the surplus source-canvas gutters. The crop ratios stay aligned
 * with the shared 21:5 visible frame, so artwork is scaled uniformly rather
 * than stretched horizontally or vertically.
 */
export const DASHBOARD_LIVE_FEATURE_CARD_CROP = {
  food: { left: 60, top: 88, width: 1416, height: 337 },
  progress: { left: 55, top: 86, width: 1426, height: 340 },
} as const;

export const DASHBOARD_LIVE_FEATURE_CARD_COPY = {
  food: {
    tr: {
      title: "Besin ve Barkod Tarayıcı",
      description: ["Yemeğini fotoğrafla veya", "paketli ürünü barkodla tara."],
    },
    en: {
      title: "Food & Barcode Scanner",
      description: ["Scan your meal with a photo or", "scan packaged products by barcode."],
    },
  },
  progress: {
    tr: {
      title: "İlerlememi Gör",
      description: ["Kilo, beslenme, su ve hareket", "verilerini incele."],
    },
    en: {
      title: "View My Progress",
      description: ["Review your weight, nutrition,", "water and activity data."],
    },
  },
} as const;

export const DASHBOARD_LIVE_FEATURE_CARD_LAYOUT = {
  food: {
    x: 310,
    titleY: 201,
    descriptionFirstY: 255,
    descriptionSecondY: 299,
    titleFontSize: { tr: 40, en: 37 },
    descriptionFontSize: 28,
    titleWeight: 800,
    descriptionWeight: 500,
    safeTextRight: 850,
  },
  progress: {
    x: 305,
    titleY: 191,
    descriptionFirstY: 248,
    descriptionSecondY: 290,
    titleFontSize: { tr: 45, en: 41 },
    descriptionFontSize: 29,
    titleWeight: 800,
    descriptionWeight: 500,
    safeTextRight: 850,
  },
} as const;

export const DASHBOARD_LIVE_FEATURE_CARD_COLORS = {
  light: {
    title: "#111b3b",
    description: "#667895",
  },
  dark: {
    title: "#f7fbfa",
    description: "#b8cedf",
  },
} as const;
