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
 * Theme-specific crop contracts align the artwork inside the SAME visible 21:5
 * frame. The outer card and all live HTML text coordinates never move.
 *
 * Progress light intentionally crops 20 source pixels farther from the left so
 * its icon/chart align with the approved dark artwork and the cards above.
 */
export const DASHBOARD_LIVE_FEATURE_CARD_CROP = {
  food: {
    light: { left: 60, top: 88, width: 1416, height: 337 },
    dark: { left: 60, top: 88, width: 1416, height: 337 },
  },
  progress: {
    light: { left: 75, top: 86, width: 1426, height: 340 },
    // Normalized from the approved dark source so the visible progress icon
    // tile matches Food: same left/top alignment and same displayed footprint.
    dark: { left: 49, top: 88, width: 1432, height: 341 },
  },
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
    descriptionFirstY: 267,
    descriptionSecondY: 313,
    titleFontSize: { tr: 46, en: 44 },
    descriptionFontSize: 38,
    titleWeight: 800,
    descriptionWeight: 500,
    safeTextRight: 850,
  },
  progress: {
    x: 305,
    titleY: 191,
    descriptionFirstY: 259,
    descriptionSecondY: 303,
    titleFontSize: { tr: 52, en: 48 },
    descriptionFontSize: 39,
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
