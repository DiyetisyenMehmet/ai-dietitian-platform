export type BloodTestCardLocale = "tr" | "en";
export type BloodTestCardTheme = "light" | "dark";

export const BLOOD_TEST_CARD_VIEWBOX = {
  width: 1438,
  height: 413,
} as const;

export const BLOOD_TEST_CARD_BASE = {
  light: "/images/dashboard/blood-test-card-base-light.png",
  dark: "/images/dashboard/blood-test-card-base-dark.png",
} as const;

export const BLOOD_TEST_CARD_VALUES = [
  "168 mg/dL",
  "102 mg/dL",
  "92 mg/dL",
  "23 ng/mL",
  "320 pg/mL",
] as const;

export const BLOOD_TEST_CARD_COPY = {
  tr: {
    title: "Kan Tahlili Analizi",
    description: ["Tahlil sonuçlarını yükle,", "anlaşılır şekilde değerlendir."],
    example: "Örnek görünüm",
    panelTitle: "Tahlil Sonuçları",
    status: "Normal",
    labels: ["Kolesterol", "Trigliserid", "Kan Şekeri", "Vitamin D", "B12 Vitamini"],
  },
  en: {
    title: "Blood Test Analysis",
    description: ["Upload your test results", "and review them clearly."],
    example: "Example preview",
    panelTitle: "Test Results",
    status: "Normal",
    labels: ["Cholesterol", "Triglycerides", "Blood Glucose", "Vitamin D", "Vitamin B12"],
  },
} as const;

/** Source-image coordinates affect decorative pixels only, never live text. */
export const BLOOD_TEST_CARD_REGIONS = {
  icon: { x: 34, y: 106, width: 180, height: 175 },
  tube: { x: 1208, y: 28, width: 224, height: 358 },
} as const;
