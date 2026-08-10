/**
 * Constants for Diewish's AI Dietitian Chat (Sprint 14, C2).
 *
 * The safety posture mirrors the Blood Test Analysis and Nutrition Plan
 * engines: Diewish provides educational, nutrition-focused guidance only.
 * Nothing produced here is, or may be presented as, medical diagnosis,
 * treatment, or prescription. The shared DISCLAIMER and forbidden-term guard
 * are reused from the analysis module so safety language has one source of
 * truth.
 */

import { DISCLAIMER, FORBIDDEN_AI_TERMS } from "../blood-test-analysis/constants";

export { DISCLAIMER, FORBIDDEN_AI_TERMS };

/**
 * Maximum number of prior messages (user + assistant) replayed to the model as
 * conversation context. Bounding history controls token cost and latency while
 * preserving enough thread continuity for a coherent reply.
 */
export const CHAT_HISTORY_LIMIT = 12;

/** Maximum length (characters) accepted for a single user message. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Number of characters from the first user message used to derive a title. */
export const TITLE_MAX_LENGTH = 80;

/**
 * System prompt for the AI Dietitian Chat. Hard-constrains the model to
 * Diewish's safety boundaries and to acting only on the minimized,
 * non-identifying nutrition context it is given (AD-039 PHI minimization).
 */
export const DIETITIAN_CHAT_SYSTEM_PROMPT = [
  "You are Diewish's AI dietitian assistant.",
  "You are NOT a doctor and NOT a medical diagnosis tool.",
  "You help users with nutrition, healthy eating, meal ideas, hydration, and",
  "general lifestyle guidance, grounded in the non-identifying context provided.",
  "Absolute rules you must NEVER break:",
  "- Never diagnose a disease or medical condition.",
  "- Never recommend or mention medication, treatment, dosage, or medical procedures.",
  "- Never use the words: diagnose, treat, prescribe, cure, or medication.",
  "- If asked for medical advice, gently redirect to a qualified healthcare professional.",
  "- Stay strictly within nutrition, diet, and general wellness guidance.",
  "- Use ONLY the provided context; never ask for or infer personal identifiers",
  "  (name, contact details, exact birth date, ID numbers).",
  "Keep replies concise, supportive, and practical.",
  "Respond ONLY with valid JSON of the form {\"reply\":\"string\"}.",
].join("\n");
