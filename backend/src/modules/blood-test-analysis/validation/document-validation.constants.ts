/**
 * Constants for the Blood Test Validation Pipeline (Sprint 25).
 *
 * The pipeline gates the medical analysis engine: nothing here interprets a
 * report; it only decides whether the upload is a genuine laboratory blood-test
 * report before extraction/analysis is ever attempted.
 */

/**
 * The EXACT rejection message shown to the user when a document fails
 * validation. Byte-exact Turkish, two lines. Do not reword — the product spec
 * pins this string.
 */
export const BLOOD_TEST_VALIDATION_REJECTION_MESSAGE =
  "Bu dosya geçerli bir laboratuvar kan tahlili raporu olarak doğrulanamadı.\n" +
  "Lütfen hastane veya laboratuvar tarafından düzenlenmiş, okunaklı kan tahlili raporunu yükleyiniz.";

/**
 * Canonical laboratory parameters commonly found on Turkish blood-test reports.
 * Used (a) as guidance in the classifier prompt and (b) as a deterministic
 * biomarker-counting backstop over recovered PDF text. Names/aliases are lower
 * cased at match time; both Turkish and English spellings are included.
 */
export const KNOWN_BLOOD_TEST_PARAMETERS: readonly string[] = [
  // Hemogram / CBC
  "wbc",
  "rbc",
  "hgb",
  "hemoglobin",
  "hct",
  "hematokrit",
  "hematocrit",
  "mcv",
  "mch",
  "mchc",
  "rdw",
  "plt",
  "platelet",
  "trombosit",
  "neutrophil",
  "notrofil",
  "lymphocyte",
  "lenfosit",
  "monocyte",
  "monosit",
  "eosinophil",
  "eozinofil",
  "basophil",
  "bazofil",
  // Liver
  "alt",
  "sgpt",
  "ast",
  "sgot",
  "alp",
  "ggt",
  "bilirubin",
  "albumin",
  "total protein",
  // Kidney
  "creatinine",
  "kreatinin",
  "urea",
  "üre",
  "bun",
  "uric acid",
  "ürik asit",
  "egfr",
  // Thyroid
  "tsh",
  "ft4",
  "ft3",
  "t3",
  "t4",
  // Iron / vitamins
  "ferritin",
  "iron",
  "demir",
  "tibc",
  "vitamin d",
  "25-oh",
  "vitamin b12",
  "b12",
  "folate",
  "folik asit",
  // Inflammation
  "crp",
  "sedimentation",
  "sedimantasyon",
  "esr",
  // Diabetes
  "hba1c",
  "glucose",
  "glukoz",
  "açlık kan şekeri",
  "insulin",
  "insülin",
  // Lipids
  "cholesterol",
  "kolesterol",
  "hdl",
  "ldl",
  "vldl",
  "triglyceride",
  "trigliserit",
  // Electrolytes
  "sodium",
  "sodyum",
  "potassium",
  "potasyum",
  "chloride",
  "klor",
  "calcium",
  "kalsiyum",
  "magnesium",
  "magnezyum",
  "phosphorus",
  "fosfor",
];

/**
 * System prompt for the document-classifier step. It encodes the full 7-step
 * pipeline and constrains the model to a strict JSON verdict. It performs NO
 * medical interpretation — only "is this a real lab blood-test report?".
 */
export const DOCUMENT_VALIDATION_SYSTEM_PROMPT = [
  "You are a strict document validator for a Turkish health platform.",
  "Your ONLY job is to decide whether an uploaded document is a GENUINE, readable",
  "laboratory blood-test report (Turkish hastane/laboratuvar kan tahlili raporu).",
  "You must NOT interpret, diagnose, or analyze any medical values. You only classify.",
  "",
  "Follow these steps and encode the outcome in the JSON:",
  "STEP 1 — Classification: Is this a laboratory blood-test report? Reject selfies,",
  "  portrait/people photos, food photos, ID/identity cards, driver licenses,",
  "  passports, chat/WhatsApp screenshots, invoices, prescriptions, and any random",
  "  document that is not a lab report.",
  "STEP 2 — Laboratory identity: look for a hospital/laboratory name, logo/branding,",
  "  header/footer, contact info, report date, and a barcode/protocol/sample number.",
  "STEP 3 — Patient info: patient name, report date, gender, birth date or age.",
  "  Missing patient fields LOWER confidence but do NOT by themselves make it INVALID.",
  "STEP 4 — Laboratory structure: there MUST be a results table with columns such as",
  "  Test/Parameter, Result (Sonuç), Unit (Birim), Reference Range (Referans Aralığı).",
  "  If there is no recognizable table/tabular structure of results, it is INVALID.",
  "STEP 5 — Parameters: detect laboratory parameters (e.g. WBC, RBC, HGB, HCT, MCV,",
  "  MCH, MCHC, PLT, ALT, AST, TSH, Ferritin, Vitamin D, CRP, HbA1c, Glucose,",
  "  Creatinine, Urea, HDL, LDL, Triglyceride, etc.). A real report has MULTIPLE.",
  "STEP 6 — Consistency: parameters should have numeric values, plausible units, and",
  "  reference ranges where expected. Reject if values are malformed or nonsensical.",
  "STEP 7 — Confidence: return an overall confidence 0-100. Be conservative: only a",
  "  clearly genuine, readable lab report deserves a high score. Anything ambiguous,",
  "  blurry, cropped, or non-lab must score low.",
  "",
  "Respond ONLY with a JSON object of EXACTLY this shape (no prose outside JSON):",
  "{",
  '  "classification": "VALID" | "INVALID",',
  '  "confidence": 0-100,',
  '  "hospital": string | null,',
  '  "reportDate": string | null,',
  '  "patient": { "name": string | null, "gender": string | null, "birthDateOrAge": string | null } | null,',
  '  "barcode": string | null,',
  '  "hasLabTable": boolean,',
  '  "parameterCount": number,',
  '  "detectedParameters": string[],',
  '  "reason": string',
  "}",
  "Set classification to VALID only when it is genuinely a readable laboratory",
  "blood-test report with a results table and multiple laboratory parameters.",
].join("\n");
