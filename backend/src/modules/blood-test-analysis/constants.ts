/**
 * Constants for Diewish's AI Blood Test Analysis Engine.
 *
 * Safety is the overriding design constraint: Diewish provides educational and
 * nutrition-focused information only. Nothing produced here is, or may be
 * presented as, medical diagnosis, treatment, or prescription.
 */

/**
 * Disclaimer appended to every AI-generated output. Kept as a single source of
 * truth so it can never drift between endpoints.
 */
export const DISCLAIMER =
  "Diewish provides educational and nutrition-focused information only. This is " +
  "not a medical diagnosis, treatment, or prescription. Blood-test values must " +
  "be interpreted by a qualified healthcare professional. Always consult your " +
  "doctor before making health decisions.";

/**
 * System prompt for the AI adapter. It hard-constrains the model to Diewish's
 * safety boundaries: explain values, surface nutritional implications, and
 * suggest dietary approaches only — never diagnose, treat, prescribe or cure.
 */
export const ANALYSIS_SYSTEM_PROMPT = [
  "You are Diewish's nutrition education assistant.",
  "You are NOT a medical diagnosis tool and you are NOT a doctor.",
  "You will be given normalized blood-test values with their reference ranges and status.",
  "Your ONLY responsibilities are:",
  "1. Explain, in plain and reassuring language, what each value represents.",
  "2. Identify NUTRITIONAL implications of out-of-range values.",
  "3. Suggest general DIETARY approaches (foods to favor / moderate).",
  "Absolute rules you must NEVER break:",
  "- Never diagnose a disease or medical condition.",
  "- Never recommend or mention medication, treatment, dosage, or medical procedures.",
  "- Never use the words: diagnose, treat, prescribe, cure, or medication.",
  "- Always direct the user to consult a qualified healthcare professional for medical interpretation.",
  "- Stay strictly within nutrition and dietary guidance.",
  "Respond ONLY with valid JSON matching the requested schema. Do not add prose outside the JSON.",
].join("\n");

/** System prompt used for the vision/text extraction step. */
export const EXTRACTION_SYSTEM_PROMPT = [
  "You are Diewish's laboratory-report data extractor.",
  "Extract every laboratory biomarker, its value, and its unit exactly as printed.",
  "Do not interpret, diagnose, or add values that are not present in the document.",
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

/**
 * User-facing (Turkish) message returned when an uploaded document is not
 * recognized as a valid blood-test report.
 */
export const NOT_A_BLOOD_TEST_MESSAGE =
  "Yüklenen dosya geçerli bir laboratuvar kan tahlili raporu olarak " +
  "doğrulanamadı. Lütfen üzerinde ölçüm değerleri, birimleri (örn. mg/dL, " +
  "mmol/L) ve referans aralıkları bulunan gerçek bir kan tahlili raporu " +
  "(PDF veya görüntü) yükleyin.";
