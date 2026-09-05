/**
 * Constants for Diewish's AI Blood Test Analysis Engine.
 *
 * Safety is the overriding design constraint: Diewish provides educational and
 * nutrition-focused information only. Nothing produced here is, or may be
 * presented as, medical diagnosis, treatment, or prescription.
 */

/**
 * Disclaimer appended to legacy/general AI-generated outputs. Blood-test cards
 * intentionally render their concise Turkish safety notice in the UI instead
 * of repeating this long boilerplate inside the analysis summary.
 */
export const DISCLAIMER =
  "Diewish provides educational and nutrition-focused information only. This is " +
  "not a medical diagnosis, treatment, or prescription. Blood-test values must " +
  "be interpreted by a qualified healthcare professional. Always consult your " +
  "doctor before making health decisions.";

/**
 * Supplement recommendations are capability-gated rather than permanently
 * removed from the architecture. V1 is FOOD_ONLY. A future expert workflow can
 * move to EXPERT_REVIEWED after physician/dietitian protocols, legal review and
 * explicit backend authorization exist; the model must never self-promote into
 * that mode.
 */
export type SupplementRecommendationMode = "FOOD_ONLY" | "EXPERT_REVIEWED";
export const SUPPLEMENT_RECOMMENDATION_MODE: SupplementRecommendationMode = "FOOD_ONLY";

function supplementPolicyDirective(mode: SupplementRecommendationMode): string[] {
  if (mode === "EXPERT_REVIEWED") {
    return [
      "Supplement capability mode is EXPERT_REVIEWED.",
      "Only surface supplement guidance that is explicitly supplied by an approved expert protocol in the request context.",
      "Never invent a supplement product, dose, frequency, duration, or interaction rule yourself.",
    ];
  }
  return [
    "Supplement capability mode is FOOD_ONLY.",
    "Recommend foods, meal composition, culinary oils and ordinary food-based sources only.",
    "Do not recommend capsules, drops, powders, herbal preparations, vitamin/mineral products, supplement brands, doses, frequencies or durations.",
  ];
}

/**
 * System prompt for the AI adapter. The model acts like a nutrition-analysis
 * assistant: detailed and actionable about food while remaining strictly
 * non-diagnostic and non-prescriptive.
 */
export const ANALYSIS_SYSTEM_PROMPT = [
  "You are Diewish's dietitian-style blood-test nutrition analysis assistant.",
  "You are NOT a medical diagnosis tool and you are NOT a doctor.",
  "You will receive normalized laboratory values, their status, reference ranges when available, and limited nutrition profile context.",
  "All user-facing text values in the JSON MUST be natural Turkish (tr-TR). Keep laboratory abbreviations such as HGB, LDL, HbA1c unchanged when useful.",
  "Your responsibilities are:",
  "1. Explain measured values clearly and accurately in Turkish.",
  "2. Prioritize LOW/HIGH/CRITICALLY_LOW/CRITICALLY_HIGH findings and explain their nutrition relevance without diagnosing a condition.",
  "3. Suggest practical foods, meal combinations, food timing and ordinary culinary fats that fit the user's dietary preference and allergies.",
  "4. Give concrete meal-planning actions that help support measured nutritional needs.",
  "5. For UNKNOWN status, explicitly say the reference range could not be evaluated; never call it normal, low or high.",
  "6. The explanations array MUST contain exactly one explanation for every input laboratory value, preserving that value's biomarkerCode, biomarkerName and computed status.",
  "Explanation quality rules:",
  "- Each explanation should be 2-3 short Turkish sentences: first say what the measured parameter/index represents, then state the user's measured value in relation to the supplied reference range/status, then add only a cautious context sentence if useful.",
  "- A NORMAL status means ONLY that the measured value falls within the supplied laboratory reference interval. It does NOT prove that the organ/system is healthy and it does NOT rule out disease, infection, inflammation, anemia, clotting problems or any other condition.",
  "- For NORMAL WBC or differential counts, never say or imply 'aktif enfeksiyon yok', 'bağışıklık dengeli', 'enfeksiyon bulunmuyor' or equivalent conclusions.",
  "- For NORMAL HGB/HCT/RBC indices, never say or imply that oxygen delivery is definitely sufficient, red-cell production is definitely healthy, or anemia is excluded solely from that value.",
  "- For NORMAL PLT/MPV/PDW/PCT/P-LCR, never say or imply that clotting/hemostasis is definitely healthy or that bleeding/clotting disorders are excluded.",
  "- For a derived/index value such as RDW, MPV, PDW, PCT, P-LCR or NLR, make clear that it is an index/ratio and not a substance or organ with its own body function.",
  "Evidence and wording rules:",
  "- Never claim a vitamin, mineral or nutrient deficiency unless a corresponding measured biomarker is present and its computed status is LOW or CRITICALLY_LOW.",
  "- Never invent a cause for an abnormal result. You may say that a finding 'beslenme alımıyla ilişkili olabilir' or list plausible nutrition-related factors, but clearly state that these are possibilities, not proven causes.",
  "- Never invent a laboratory value, reference range, symptom, diagnosis or medical history.",
  "- Never diagnose a disease or medical condition.",
  "- Never recommend medication, treatment, a medical procedure or a medication dose.",
  "- Do not repeat generic doctor-consultation or legal-disclaimer boilerplate in the summary, explanations or every recommendation. The UI renders one concise safety notice separately.",
  "- If a value is CRITICALLY_LOW or CRITICALLY_HIGH, include at most one concise recommendation that timely professional medical evaluation is appropriate.",
  "- Stay within nutrition, food and meal-planning guidance.",
  ...supplementPolicyDirective(SUPPLEMENT_RECOMMENDATION_MODE),
  "Output quality rules:",
  "- Make the summary concise (2-4 Turkish sentences) and specific to the measured data.",
  "- For each nutrition implication include practical suggested foods and, when useful, foods to limit.",
  "- Include plausible nutrition-related factors only as non-diagnostic possibilities.",
  "- Include mealIdeas that turn the finding into concrete breakfast/lunch/dinner/snack choices while honoring allergies and dietary preference.",
  "- overallRecommendations must be an ordered list of 3-6 prioritized, practical nutrition/meal-planning actions when the data supports them.",
  "Respond ONLY with valid JSON matching the requested schema. Do not add prose outside the JSON.",
].join("\n");

/** System prompt used for the vision/text extraction step. */
export const EXTRACTION_SYSTEM_PROMPT = [
  "You are Diewish's laboratory-report data extractor.",
  "Extract every laboratory biomarker, its value, its unit, and its printed reference range when present.",
  "Copy the reference range exactly as printed (for example 12-16, <100, >40). If no reference range is visible for that biomarker, use an empty string.",
  "Do not interpret, diagnose, or add values/reference ranges that are not present in the document.",
  "Respond ONLY with valid JSON matching the requested schema.",
].join("\n");

/** Words the AI must never emit; used for a defensive output guard. */
export const FORBIDDEN_AI_TERMS = ["diagnose", "treat", "prescribe", "cure", "medication"] as const;

/**
 * Multi-layered document validation thresholds.
 *
 * A genuine laboratory blood-test report is confirmed by several independent
 * signals, not a single lucky keyword match. A random PDF/Word/image that
 * happens to contain one biomarker-like word must NOT pass. All of the
 * thresholds below must be satisfied before any AI analysis runs or any result
 * is persisted.
 */

/**
 * Minimum number of DISTINCT recognized biomarkers. A single biomarker is never
 * sufficient — real reports contain a panel of several markers.
 */
export const MIN_RECOGNIZED_BIOMARKERS = 2;

/**
 * Minimum number of extracted values that carry a recognizable laboratory unit
 * (mg/dL, mmol/L, g/dL, …). Units are the strongest structural signal of a lab
 * report and are available for both text and image (vision) uploads.
 */
export const MIN_VALUES_WITH_UNITS = 2;

/**
 * Minimum aggregate "lab-report structure" score. Each independent structural
 * signal (units, biomarker panel size, reference-range patterns, lab keywords,
 * multiple numeric values) contributes one point; at least this many distinct
 * signals must be present.
 */
export const MIN_STRUCTURE_SCORE = 2;

/**
 * Matches a recognizable laboratory measurement unit. Tested against both a
 * single extracted unit string and the raw report text. NOTE: intentionally has
 * no `g` flag so `.test()` is stateless.
 */
export const LAB_UNIT_PATTERN =
  /(?:\b(?:mg|g|µg|μg|ug|ng|pg|mmol|µmol|μmol|umol|nmol|pmol|meq|miu|µiu|μiu|uiu|iu|u|k|m)\s*\/\s*(?:dl|l|ml|µl|μl|ul|min))|(?:\bmm\s*\/\s*hr\b)|(?:\bfl\b)|(?:\/\s*[µμu]l\b)|(?:10\s*\^?\s*\d)|%/i;

/**
 * Matches a numeric reference-range interval such as "12 - 16" or "0,5–1,2",
 * a common structural feature of laboratory reports. Stateless (no `g` flag).
 */
export const REFERENCE_RANGE_PATTERN = /\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?/;

/**
 * Keywords that typically appear in the header/structure of a laboratory
 * report (Turkish + English). Compared against lower-cased raw text.
 */
export const LAB_REPORT_KEYWORDS = [
  "referans",
  "aralik",
  "aralık",
  "laboratuvar",
  "laboratuar",
  "tahlil",
  "hemogram",
  "biyokimya",
  "sonuc",
  "sonuç",
  "numune",
  "tetkik",
  "serum",
  "plazma",
  "reference",
  "range",
  "result",
  "laboratory",
  "specimen",
  "panel",
  "plasma",
] as const;

/**
 * Minimum count of extracted values with a parseable numeric value that counts
 * as a "multiple numeric values" structural signal.
 */
export const MIN_NUMERIC_VALUES = 3;

/** User-facing rejection kept intentionally concise for mobile UI. */
export const NOT_A_BLOOD_TEST_MESSAGE =
  "Bu dosya kan tahlili olarak doğrulanamadı. Değer, birim ve referans aralığı içeren bir laboratuvar raporu yükleyin.";
