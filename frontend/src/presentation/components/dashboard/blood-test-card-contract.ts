export type BloodTestCardLocale = "tr" | "en" | "ar";
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
  ar: {
    title: "تحليل فحوصات الدم",
    description: ["حمّل نتائج فحوصاتك،", "وراجعها بوضوح."],
    panelTitle: "نتائج الفحوصات",
    status: "طبيعي",
    labels: ["الكوليسترول", "الدهون الثلاثية", "سكر الدم", "فيتامين D", "فيتامين B12"],
  },
} as const;

/**
 * Coordinates are measured against the approved 1438 × 413 visual.
 * No text position is derived from viewport size or browser line wrapping.
 */
export const BLOOD_TEST_CARD_LAYOUT = {
  title: { x: 258, rtlX: 720, y: 158, fontSize: 45, fontWeight: 700 },
  description: {
    x: 258,
    rtlX: 720,
    firstY: 203,
    secondY: 235,
    fontSize: 26,
    fontWeight: 500,
  },
  // The heading intentionally sits slightly right/down from the row-label edge.
  panelTitle: { x: 818, rtlX: 1010, y: 88, fontSize: 23, fontWeight: 700 },
  status: { x: 1117, y: 86, fontSize: 21, fontWeight: 700 },
  rows: {
    labelX: 806,
    rtlLabelX: 1038,
    valueX: 1174,
    y: [140, 185, 230, 276, 322],
    labelFontSize: 22,
    valueFontSize: 21,
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
