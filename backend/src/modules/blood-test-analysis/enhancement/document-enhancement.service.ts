import { logger } from "../../../lib/logger";
import { env } from "../../../config/env";
import { extractPdfText, meaningfulCharCount } from "../extraction/pdf-text-extractor";

/**
 * Document Enhancement Pipeline (foundation).
 *
 * This service runs BEFORE the Blood Test Validation Pipeline:
 *
 *   Upload → **Document Enhancement** → Blood Test Validation → OCR → Medical AI
 *
 * Its sole responsibility is *image preprocessing* — cleaning up a raw upload so
 * downstream validation / OCR / vision see the best possible input. It never
 * classifies, extracts, or interprets medical content; those remain the job of
 * the validation and analysis pipelines and are intentionally untouched here.
 *
 * ── Design ──────────────────────────────────────────────────────────────────
 * The pipeline is a modular, ordered list of {@link EnhancementStep}s. Each step
 * is a small, independent unit that receives the current buffer and returns a
 * (possibly) transformed buffer plus a note about what it did. New steps can be
 * added later by appending to {@link IMAGE_ENHANCEMENT_STEPS} without touching
 * the orchestrator or the callers.
 *
 * ── Current capability ──────────────────────────────────────────────────────
 * The requested safe steps are:
 *   - auto rotation using image metadata (EXIF orientation)
 *   - normalize image orientation
 *   - auto contrast
 *   - brightness normalization
 *
 * These require a lightweight image-processing library (e.g. `sharp` or `jimp`).
 * The repository currently ships NO such library (only `pdf-parse` and
 * `tesseract.js`, neither of which manipulates pixels), and this change must not
 * install new native/heavy dependencies (no OpenCV, no new packages). Therefore
 * every step is currently registered as a **pass-through** with a clearly marked
 * extension point (`// EXTENSION POINT:`) describing exactly where the real
 * transform will be implemented once an approved lightweight library is added.
 *
 * This keeps the pipeline order and integration final and correct today, while
 * the actual pixel transforms can be dropped in later as a pure, isolated change
 * to the individual steps below.
 */

/** Steps only make sense for raster images; PDFs with a real text layer skip. */
const IMAGE_MIME_PREFIX = "image/";
const PDF_MIME = "application/pdf";

/** Context handed to each enhancement step. */
export interface EnhancementContext {
  /** MIME type of the uploaded document. */
  readonly mimeType: string;
}

/** Result of running a single enhancement step. */
export interface EnhancementStepResult {
  /** The (possibly) transformed buffer. Pass-through returns the input as-is. */
  readonly buffer: Buffer;
  /** Whether this step actually modified the bytes. */
  readonly changed: boolean;
  /** Short human-readable note for logging/auditing. */
  readonly note: string;
}

/** A single, independent image-preprocessing step. */
export interface EnhancementStep {
  /** Stable identifier used in logs and future configuration. */
  readonly name: string;
  /** Applies the step. MUST NOT throw; on any failure return the input buffer. */
  apply(buffer: Buffer, ctx: EnhancementContext): Promise<EnhancementStepResult>;
}

/** Result of running the whole enhancement pipeline. */
export interface DocumentEnhancementResult {
  /** The final buffer to hand to the validation pipeline. */
  readonly buffer: Buffer;
  /** Ordered names of the steps that actually changed the bytes. */
  readonly appliedSteps: string[];
  /** Whether enhancement was skipped entirely (e.g. clean text-layer PDF). */
  readonly skipped: boolean;
}

/**
 * Builds a no-op step. Returns the input buffer unchanged and documents where
 * the real transform belongs. Used until an approved lightweight image library
 * is available in the project.
 */
function passThroughStep(name: string, extensionNote: string): EnhancementStep {
  // `extensionNote` documents exactly what the real transform must do; it is
  // surfaced in the step result so the extension point is discoverable at
  // runtime/log level until a lightweight image library (e.g. sharp/jimp) is
  // approved and the transform is implemented here (keep `apply` non-throwing).
  return {
    name,
    async apply(buffer: Buffer): Promise<EnhancementStepResult> {
      return {
        buffer,
        changed: false,
        note: `${name}: pass-through (no image library available) — TODO: ${extensionNote}`,
      };
    },
  };
}

/**
 * The ordered image-enhancement steps. Append new steps here; the orchestrator
 * and callers require no changes.
 */
export const IMAGE_ENHANCEMENT_STEPS: EnhancementStep[] = [
  passThroughStep(
    "auto-rotate",
    "Rotate the image according to its EXIF Orientation tag so text is upright.",
  ),
  passThroughStep(
    "normalize-orientation",
    "Strip/normalize the orientation metadata after rotating so downstream " +
      "consumers always see a top-left origin.",
  ),
  passThroughStep(
    "auto-contrast",
    "Apply automatic contrast stretching (histogram normalization) to improve " +
      "legibility of faint scans/photos.",
  ),
  passThroughStep(
    "brightness-normalize",
    "Normalize overall brightness so under/over-exposed phone photos land in a " +
      "consistent range before OCR/vision.",
  ),
];

export const documentEnhancementService = {
  /**
   * Runs the enhancement pipeline over an uploaded document.
   *
   * Behaviour:
   *  - **Clean text-layer PDF** → enhancement is skipped entirely (the document
   *    is already machine-readable; pixel preprocessing is irrelevant and could
   *    only add cost/risk).
   *  - **Images** → each registered step runs in order; today they are
   *    pass-throughs, so the original bytes are returned unchanged.
   *  - **Image-only / scanned PDFs and other types** → currently returned
   *    unchanged (extension point: rasterize-then-enhance can be added later).
   *
   * The method never throws for enhancement reasons; on any internal issue it
   * falls back to returning the original buffer so the pipeline order is safe.
   *
   * @param buffer - Raw uploaded document bytes.
   * @param mimeType - Detected MIME type of the document.
   */
  async enhance(buffer: Buffer, mimeType: string): Promise<DocumentEnhancementResult> {
    // Clean PDF with a usable text layer → skip enhancement completely.
    if (mimeType === PDF_MIME) {
      const text = await extractPdfText(buffer).catch(() => "");
      if (meaningfulCharCount(text) >= env.BLOOD_TEST_TEXT_MIN_CHARS) {
        logger.info("Enhancement: clean text-layer PDF → skipped");
        return { buffer, appliedSteps: [], skipped: true };
      }
      // Image-only / scanned PDF: no rasterizer/image library is available, so
      // pass through untouched for now.
      // EXTENSION POINT: rasterize each page to an image and run the image
      // steps below once a lightweight rasterizer/image library is approved.
      logger.info("Enhancement: scanned/image-only PDF → pass-through");
      return { buffer, appliedSteps: [], skipped: false };
    }

    if (!mimeType.startsWith(IMAGE_MIME_PREFIX)) {
      // Unknown type: nothing to preprocess safely.
      return { buffer, appliedSteps: [], skipped: false };
    }

    // Image upload → run the ordered enhancement steps.
    let current = buffer;
    const applied: string[] = [];
    const ctx: EnhancementContext = { mimeType };
    for (const step of IMAGE_ENHANCEMENT_STEPS) {
      try {
        const result = await step.apply(current, ctx);
        current = result.buffer;
        if (result.changed) applied.push(step.name);
      } catch (error) {
        // A step must never break the pipeline — keep the last good buffer.
        logger.warn({ err: error, step: step.name }, "Enhancement step failed; skipping");
      }
    }

    if (applied.length > 0) {
      logger.info({ appliedSteps: applied }, "Enhancement: image preprocessing applied");
    } else {
      logger.info("Enhancement: image preprocessing → pass-through (no active transforms)");
    }
    return { buffer: current, appliedSteps: applied, skipped: false };
  },
};
