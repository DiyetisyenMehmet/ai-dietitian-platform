/**
 * Canonical biomarker registry and fuzzy alias matching for Diewish.
 *
 * Lab reports print the same biomarker under many names/abbreviations and in
 * several languages (English + Turkish for Diewish's audience). This map lets
 * the normalizer collapse those variants onto a single canonical code so values
 * can be compared against DB reference ranges reliably.
 */

/** A canonical biomarker definition. */
export interface BiomarkerDefinition {
  /** Canonical code (matches `BloodTestReferenceRange.biomarkerCode`). */
  code: string;
  /** Canonical English display name. */
  name: string;
  /** Canonical unit used by the seeded reference range. */
  canonicalUnit: string;
  /** Lower-cased alias strings (English + Turkish + abbreviations). */
  aliases: string[];
}

/** The canonical biomarker registry keyed by code. */
export const BIOMARKERS: Record<string, BiomarkerDefinition> = {
  WBC: { code: "WBC", name: "White Blood Cells", canonicalUnit: "10^3/uL", aliases: ["wbc", "white blood cell", "white blood cells", "leukocytes", "lökosit", "beyaz küre"] },
  RBC: { code: "RBC", name: "Red Blood Cells", canonicalUnit: "10^6/uL", aliases: ["rbc", "red blood cell", "red blood cells", "erythrocytes", "eritrosit", "kırmızı küre"] },
  HGB: { code: "HGB", name: "Hemoglobin", canonicalUnit: "g/dL", aliases: ["hgb", "hb", "hemoglobin", "haemoglobin", "hemoglobin (hb)"] },
  HCT: { code: "HCT", name: "Hematocrit", canonicalUnit: "%", aliases: ["hct", "hematocrit", "haematocrit", "hematokrit"] },
  MCV: { code: "MCV", name: "Mean Corpuscular Volume", canonicalUnit: "fL", aliases: ["mcv", "mean corpuscular volume", "ortalama eritrosit hacmi"] },
  MCH: { code: "MCH", name: "Mean Corpuscular Hemoglobin", canonicalUnit: "pg", aliases: ["mch", "mean corpuscular hemoglobin"] },
  MCHC: { code: "MCHC", name: "Mean Corpuscular Hemoglobin Concentration", canonicalUnit: "g/dL", aliases: ["mchc", "mean corpuscular hemoglobin concentration"] },
  RDW_CV: { code: "RDW_CV", name: "Red Cell Distribution Width (CV)", canonicalUnit: "%", aliases: ["rdw-cv", "rdw cv", "rdwcv", "red cell distribution width cv"] },
  RDW_SD: { code: "RDW_SD", name: "Red Cell Distribution Width (SD)", canonicalUnit: "fL", aliases: ["rdw-sd", "rdw sd", "rdwsd", "red cell distribution width sd"] },
  PLT: { code: "PLT", name: "Platelets", canonicalUnit: "10^3/uL", aliases: ["plt", "platelet", "platelets", "thrombocytes", "trombosit"] },
  MPV: { code: "MPV", name: "Mean Platelet Volume", canonicalUnit: "fL", aliases: ["mpv", "mean platelet volume", "ortalama trombosit hacmi"] },
  PDW: { code: "PDW", name: "Platelet Distribution Width", canonicalUnit: "fL", aliases: ["pdw", "platelet distribution width", "trombosit dağılım genişliği"] },
  P_LCR: { code: "P_LCR", name: "Platelet Large Cell Ratio", canonicalUnit: "%", aliases: ["p-lcr", "p lcr", "plcr", "platelet large cell ratio"] },
  NEUT_ABS: { code: "NEUT_ABS", name: "Neutrophils (Absolute)", canonicalUnit: "K/uL", aliases: ["neut#", "neu#", "ne#", "neut abs", "neutrophils absolute", "nötrofil mutlak", "notrofil mutlak"] },
  NEUT_PCT: { code: "NEUT_PCT", name: "Neutrophils (%)", canonicalUnit: "%", aliases: ["neut%", "neu%", "ne%", "neutrophils %", "nötrofil %", "notrofil %"] },
  LYMPH_ABS: { code: "LYMPH_ABS", name: "Lymphocytes (Absolute)", canonicalUnit: "K/uL", aliases: ["lymph#", "lym#", "ly#", "lymph abs", "lymphocytes absolute", "lenfosit mutlak"] },
  LYMPH_PCT: { code: "LYMPH_PCT", name: "Lymphocytes (%)", canonicalUnit: "%", aliases: ["lymph%", "lym%", "ly%", "lymphocytes %", "lenfosit %"] },
  MONO_ABS: { code: "MONO_ABS", name: "Monocytes (Absolute)", canonicalUnit: "K/uL", aliases: ["mono#", "mon#", "mo#", "monocytes absolute", "monosit mutlak"] },
  MONO_PCT: { code: "MONO_PCT", name: "Monocytes (%)", canonicalUnit: "%", aliases: ["mono%", "mon%", "mo%", "monocytes %", "monosit %"] },
  EOS_ABS: { code: "EOS_ABS", name: "Eosinophils (Absolute)", canonicalUnit: "K/uL", aliases: ["eo#", "eos#", "eosinophils absolute", "eozinofil mutlak"] },
  EOS_PCT: { code: "EOS_PCT", name: "Eosinophils (%)", canonicalUnit: "%", aliases: ["eo%", "eos%", "eosinophils %", "eozinofil %"] },
  BASO_ABS: { code: "BASO_ABS", name: "Basophils (Absolute)", canonicalUnit: "K/uL", aliases: ["baso#", "bas#", "ba#", "basophils absolute", "bazofil mutlak"] },
  BASO_PCT: { code: "BASO_PCT", name: "Basophils (%)", canonicalUnit: "%", aliases: ["baso%", "bas%", "ba%", "basophils %", "bazofil %"] },
  NLR: { code: "NLR", name: "Neutrophil-to-Lymphocyte Ratio", canonicalUnit: "", aliases: ["nlr", "nlr ne# / ly#", "neutrophil lymphocyte ratio", "nötrofil lenfosit oranı"] },
  GLUCOSE: { code: "GLUCOSE", name: "Glucose (Fasting)", canonicalUnit: "mg/dL", aliases: ["glucose", "fasting glucose", "blood glucose", "glukoz", "açlık kan şekeri", "aks", "fbg", "fpg"] },
  HBA1C: { code: "HBA1C", name: "Hemoglobin A1c", canonicalUnit: "%", aliases: ["hba1c", "hb a1c", "%hba1c", "%hb a1c", "%hb a1c ngsp", "hba1c ngsp", "a1c", "hemoglobin a1c", "glycated hemoglobin", "hemoglobin a1c (hba1c)"] },
  INSULIN: { code: "INSULIN", name: "Insulin (Fasting)", canonicalUnit: "uIU/mL", aliases: ["insulin", "fasting insulin", "insülin"] },
  BUN: { code: "BUN", name: "Blood Urea Nitrogen", canonicalUnit: "mg/dL", aliases: ["bun", "blood urea nitrogen", "urea nitrogen", "üre"] },
  CREATININE: { code: "CREATININE", name: "Creatinine", canonicalUnit: "mg/dL", aliases: ["creatinine", "kreatinin", "creat"] },
  EGFR: { code: "EGFR", name: "Estimated GFR", canonicalUnit: "mL/min/1.73m2", aliases: ["egfr", "estimated gfr", "gfr", "e-gfr"] },
  TOTAL_CHOLESTEROL: { code: "TOTAL_CHOLESTEROL", name: "Total Cholesterol", canonicalUnit: "mg/dL", aliases: ["total cholesterol", "cholesterol total", "cholesterol", "kolesterol", "total kolesterol"] },
  LDL: { code: "LDL", name: "LDL Cholesterol", canonicalUnit: "mg/dL", aliases: ["ldl", "ldl cholesterol", "ldl-c", "low density lipoprotein", "ldl kolesterol"] },
  HDL: { code: "HDL", name: "HDL Cholesterol", canonicalUnit: "mg/dL", aliases: ["hdl", "hdl cholesterol", "hdl-c", "high density lipoprotein", "hdl kolesterol"] },
  TRIGLYCERIDES: { code: "TRIGLYCERIDES", name: "Triglycerides", canonicalUnit: "mg/dL", aliases: ["triglycerides", "triglyceride", "tg", "trigliserid", "trigliserit"] },
  VLDL: { code: "VLDL", name: "VLDL Cholesterol", canonicalUnit: "mg/dL", aliases: ["vldl", "vldl cholesterol", "vldl-c", "very low density lipoprotein"] },
  ALT: { code: "ALT", name: "Alanine Aminotransferase (ALT)", canonicalUnit: "U/L", aliases: ["alt", "alanine aminotransferase", "sgpt", "alt (sgpt)"] },
  AST: { code: "AST", name: "Aspartate Aminotransferase (AST)", canonicalUnit: "U/L", aliases: ["ast", "aspartate aminotransferase", "sgot", "ast (sgot)"] },
  ALP: { code: "ALP", name: "Alkaline Phosphatase", canonicalUnit: "U/L", aliases: ["alp", "alkaline phosphatase", "alkalen fosfataz"] },
  BILIRUBIN_TOTAL: { code: "BILIRUBIN_TOTAL", name: "Total Bilirubin", canonicalUnit: "mg/dL", aliases: ["bilirubin", "total bilirubin", "bilirubin total", "total bilirübin", "t.bil"] },
  ALBUMIN: { code: "ALBUMIN", name: "Albumin", canonicalUnit: "g/dL", aliases: ["albumin", "albümin"] },
  TSH: { code: "TSH", name: "Thyroid Stimulating Hormone", canonicalUnit: "uIU/mL", aliases: ["tsh", "thyroid stimulating hormone", "thyrotropin"] },
  FT3: { code: "FT3", name: "Free T3", canonicalUnit: "pg/mL", aliases: ["ft3", "free t3", "free triiodothyronine", "serbest t3", "st3"] },
  FT4: { code: "FT4", name: "Free T4", canonicalUnit: "ng/dL", aliases: ["ft4", "free t4", "free thyroxine", "serbest t4", "st4"] },
  VITAMIN_D: { code: "VITAMIN_D", name: "Vitamin D (25-OH)", canonicalUnit: "ng/mL", aliases: ["vitamin d", "25-oh vitamin d", "25 hydroxy vitamin d", "vit d", "d vitamini", "25(oh)d"] },
  VITAMIN_B12: { code: "VITAMIN_B12", name: "Vitamin B12", canonicalUnit: "pg/mL", aliases: ["vitamin b12", "b12", "cobalamin", "vit b12", "b12 vitamini"] },
  TIBC: { code: "TIBC", name: "Total Iron-Binding Capacity (TIBC)", canonicalUnit: "ug/dL", aliases: ["tibc", "total iron binding capacity", "total iron-binding capacity", "total demir bağlama kapasitesi", "demir bağlama kapasitesi", "tdbk"] },
  IRON: { code: "IRON", name: "Iron (Serum)", canonicalUnit: "ug/dL", aliases: ["iron", "serum iron", "demir", "fe"] },
  FERRITIN: { code: "FERRITIN", name: "Ferritin", canonicalUnit: "ng/mL", aliases: ["ferritin", "ferritin (serum)"] },
  FOLATE: { code: "FOLATE", name: "Folate", canonicalUnit: "ng/mL", aliases: ["folate", "folic acid", "folat", "folik asit", "vitamin b9"] },
};

/** Normalizes a label for comparison: lower-case, collapse whitespace, strip noise. */
function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[()[\]:.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pre-built alias → code lookup for exact matches. */
const ALIAS_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const def of Object.values(BIOMARKERS)) {
    index.set(normalizeLabel(def.name), def.code);
    index.set(normalizeLabel(def.code), def.code);
    for (const alias of def.aliases) {
      index.set(normalizeLabel(alias), def.code);
    }
  }
  return index;
})();

/**
 * Matches an extracted biomarker label to a canonical code.
 *
 * Strategy: exact normalized match first, then a token-containment heuristic
 * (the alias appears as a whole word inside the label, or vice versa). Returns
 * `null` when no confident match is found so the value can be flagged UNKNOWN.
 *
 * @param label - Raw biomarker label as extracted from the report.
 * @returns The canonical biomarker code, or `null`.
 */
export function matchBiomarkerCode(label: string): string | null {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;

  const exact = ALIAS_INDEX.get(normalized);
  if (exact) return exact;

  // Containment heuristic against the longest matching alias to reduce
  // false positives (e.g. "ldl cholesterol" should beat "cholesterol").
  let best: { code: string; length: number } | null = null;
  for (const [alias, code] of ALIAS_INDEX.entries()) {
    if (alias.length < 3) continue;
    const isMatch =
      normalized === alias ||
      normalized.startsWith(`${alias} `) ||
      normalized.endsWith(` ${alias}`) ||
      normalized.includes(` ${alias} `) ||
      alias === normalized;
    if (isMatch && (!best || alias.length > best.length)) {
      best = { code, length: alias.length };
    }
  }

  return best?.code ?? null;
}

/** Returns the canonical definition for a code, if known. */
export function getBiomarkerDefinition(code: string): BiomarkerDefinition | undefined {
  return BIOMARKERS[code];
}
