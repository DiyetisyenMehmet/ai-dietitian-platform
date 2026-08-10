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
