import sharp, { Sharp } from "sharp";

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
  /**
   * Multiplicative brightness factor (1 = unchanged) derived from image
   * luminance statistics in {@link documentEnhancementService.enhance}. The
   * brightness step consumes this so its transform stays data-driven yet the
   * step itself remains a pure, side-effect-free pipeline chain.
   */
  readonly brightnessFactor: number;
}

/**
 * A single, independent image-preprocessing step. Each step chains its
 * transform onto a shared `sharp` pipeline so the whole enhancement runs as ONE
 * decode + ONE encode (preserving resolution and avoiding repeated re-encoding
 * quality loss). New steps are added by appending to
 * {@link IMAGE_ENHANCEMENT_STEPS}; callers require no changes.
 */
export interface EnhancementStep {
  /** Stable identifier used in logs and future configuration. */
  readonly name: string;
  /** Chains this step's transform onto the pipeline. MUST be pure/non-throwing. */
  apply(pipeline: Sharp, ctx: EnhancementContext): Sharp;
}

/** Result of running the whole enhancement pipeline. */
export interface DocumentEnhancementResult {
  /** The final buffer to hand to the validation pipeline. */
  readonly buffer: Buffer;
  /** Ordered names of the steps that ran on the pipeline. */
  readonly appliedSteps: string[];
  /** Whether enhancement was skipped entirely (e.g. clean text-layer PDF). */
  readonly skipped: boolean;
}

/**
 * The ordered image-enhancement steps. Append new steps here; the orchestrator
 * and callers require no changes.
 *
 * Implemented with `sharp` (lightweight, production-grade). The steps are the
 * four safe preprocessing operations required for lab-report photos/scans:
 *   1. auto orientation using EXIF
 *   2. auto rotation normalization
 *   3. auto contrast normalization
 *   4. brightness normalization
 * None of them resize the image, so the ORIGINAL RESOLUTION is preserved.
 */
export const IMAGE_ENHANCEMENT_STEPS: EnhancementStep[] = [
  {
    name: "auto-orient-exif",
    // `sharp.rotate()` with no angle reads the EXIF Orientation tag and rotates
    // the pixels so the image is displayed upright (auto orientation via EXIF).
    apply: (p) => p.rotate(),
  },
  {
    name: "normalize-rotation",
    // `rotate()` above also bakes the orientation into the pixel data and resets
    // the stored orientation to the identity, and sharp does not re-attach the
    // stale EXIF orientation on output by default — so the rotation is fully
    // normalized to a top-left origin. Kept as an explicit, named step so the
    // guarantee is auditable and future rotation logic has a clear home.
    apply: (p) => p,
  },
  {
    name: "auto-contrast",
    // `normalize()` performs a histogram stretch (per-channel min/max to full
    // range), improving legibility of faint scans without altering resolution.
    apply: (p) => p.normalize(),
  },
  {
    name: "brightness-normalize",
    // Gentle, data-driven exposure correction toward a mid target. The factor
    // is precomputed from image stats and clamped (see enhance()); 1 = no-op.
    apply: (p, ctx) =>
      ctx.brightnessFactor !== 1 ? p.modulate({ brightness: ctx.brightnessFactor }) : p,
  },
];

/** Target mean luminance (0–255) the brightness step normalizes toward. */
const BRIGHTNESS_TARGET = 128;
/** Clamp bounds so brightness correction never blows out / crushes an image. */
const BRIGHTNESS_MIN = 0.7;
const BRIGHTNESS_MAX = 1.4;

/**
 * Computes a clamped brightness factor from an image's mean luminance so an
 * under/over-exposed phone photo is nudged toward a consistent exposure. Returns
 * 1 (no change) on any failure or for an already well-exposed image.
 */
async function computeBrightnessFactor(buffer: Buffer): Promise<number> {
  try {
    const stats = await sharp(buffer, { failOn: "none" }).stats();
    const rgb = stats.channels.slice(0, 3);
    if (rgb.length === 0) return 1;
    const meanLuma = rgb.reduce((sum, c) => sum + c.mean, 0) / rgb.length;
    if (!(meanLuma > 0)) return 1;
    const factor = BRIGHTNESS_TARGET / meanLuma;
    return Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX, factor));
  } catch {
    return 1;
  }
}

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

    // Image upload → run the real sharp preprocessing pipeline as ONE decode +
    // ONE encode. Never throws: on any failure we fall back to the original
    // bytes so the pipeline order (enhancement → validation → OCR → medical AI)
    // stays safe and validation/OCR/medical-AI logic is untouched.
    try {
      const meta = await sharp(buffer, { failOn: "none" }).metadata();
      const brightnessFactor = await computeBrightnessFactor(buffer);
      const ctx: EnhancementContext = { mimeType, brightnessFactor };

      let pipeline = sharp(buffer, { failOn: "none" });
      const applied: string[] = [];
      for (const step of IMAGE_ENHANCEMENT_STEPS) {
        pipeline = step.apply(pipeline, ctx);
        applied.push(step.name);
      }

      // Re-encode in the SAME format, preserving resolution (no resize) and
      // using high-quality / low-compression settings so the image is never
      // aggressively compressed.
      switch (meta.format) {
        case "jpeg":
          pipeline = pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" });
          break;
        case "png":
          pipeline = pipeline.png({ compressionLevel: 6 });
          break;
        case "webp":
          pipeline = pipeline.webp({ quality: 95 });
          break;
        default:
          // Leave sharp to emit its default encoding for the input format.
          break;
      }

      const out = await pipeline.toBuffer();
      logger.info(
        { appliedSteps: applied, format: meta.format, brightnessFactor },
        "Enhancement: image preprocessing applied",
      );
      return { buffer: out, appliedSteps: applied, skipped: false };
    } catch (error) {
      logger.warn(
        { err: error },
        "Enhancement: image preprocessing failed; using original buffer",
      );
      return { buffer, appliedSteps: [], skipped: false };
    }
  },
};
