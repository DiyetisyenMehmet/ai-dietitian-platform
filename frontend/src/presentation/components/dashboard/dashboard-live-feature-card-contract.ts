export type DashboardLiveFeatureCardKind = "food" | "progress";
export type DashboardLiveFeatureCardLocale = "tr" | "en";
export type DashboardLiveFeatureCardTheme = "light" | "dark";

export const DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX = {
  width: 1536,
  height: 512,
} as const;

export const DASHBOARD_LIVE_FEATURE_CARD_ASPECT =
  `${DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.width} / ${DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.height}`;

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

/**
 * One coordinate contract is shared by light and dark. Theme changes only swap
 * the approved text-free base visual and text colors; geometry never changes.
 */
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
