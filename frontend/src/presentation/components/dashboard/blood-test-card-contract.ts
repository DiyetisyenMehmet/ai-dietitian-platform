export type BloodTestCardLocale = "tr" | "en";
export type BloodTestCardTheme = "light" | "dark";

export const BLOOD_TEST_CARD_VIEWBOX = {
  width: 1438,
  height: 413,
} as const;

export const BLOOD_TEST_CARD_ASPECT = `${BLOOD_TEST_CARD_VIEWBOX.width} / ${BLOOD_TEST_CARD_VIEWBOX.height}`;

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
    panelTitle: "Tahlil Sonuçları",
    status: "Normal",
    labels: ["Kolesterol", "Trigliserid", "Kan Şekeri", "Vitamin D", "B12 Vitamini"],
  },
  en: {
    title: "Blood Test Analysis",
    description: ["Upload your test results", "and review them clearly."],
    panelTitle: "Test Results",
    status: "Normal",
    labels: ["Cholesterol", "Triglycerides", "Blood Glucose", "Vitamin D", "Vitamin B12"],
  },
} as const;

/**
 * Coordinates are measured against the approved 1438 x 413 visual.
 * HTML text uses these exact design coordinates and scales with the card width.
 */
export const BLOOD_TEST_CARD_LAYOUT = {
  title: { x: 258, y: 158, fontSize: 52, fontWeight: 700 },
  description: {
    x: 258,
    firstY: 214,
    secondY: 250,
    fontSize: 36,
    fontWeight: 500,
  },
  panelTitle: { x: 818, y: 88, fontSize: 27, fontWeight: 700 },
  status: { x: 1117, y: 86, fontSize: 25, fontWeight: 700 },
  rows: {
    labelX: 806,
    valueX: 1174,
    y: [140, 185, 230, 276, 322],
    labelFontSize: 26,
    valueFontSize: 25,
    labelWeight: 500,
    valueWeight: 600,
  },
} as const;

export const BLOOD_TEST_CARD_COLORS = {
  light: {
    title: "#111827",
    description: "#64748b",
    panelTitle: "#334155",
    label: "#475569",
    value: "#172033",
    status: "#08745f",
  },
  dark: {
    title: "#f5fbf9",
    description: "#a8c8c0",
    panelTitle: "#e8f4f1",
    label: "#c3d8d4",
    value: "#f7fbfa",
    status: "#effff9",
  },
} as const;
