export type DashboardLiveFeatureCardKind = "food" | "progress";
export type DashboardLiveFeatureCardLocale = "tr" | "en";
export type DashboardLiveFeatureCardTheme = "light" | "dark";

export const DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX = {
  width: 1536,
  height: 512,
} as const;

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

/** Crops isolate the existing illustration and icon; no text is positioned here. */
export const DASHBOARD_LIVE_FEATURE_CARD_REGIONS = {
  food: {
    light: {
      icon: { x: 100, y: 170, width: 180, height: 176 },
      illustration: { x: 650, y: 88, width: 826, height: 337 },
    },
    dark: {
      icon: { x: 100, y: 170, width: 180, height: 176 },
      illustration: { x: 650, y: 88, width: 826, height: 337 },
    },
  },
  progress: {
    light: {
      icon: { x: 105, y: 166, width: 193, height: 192 },
      illustration: { x: 825, y: 107, width: 635, height: 300 },
    },
    dark: {
      icon: { x: 90, y: 170, width: 182, height: 182 },
      illustration: { x: 825, y: 107, width: 635, height: 300 },
    },
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
