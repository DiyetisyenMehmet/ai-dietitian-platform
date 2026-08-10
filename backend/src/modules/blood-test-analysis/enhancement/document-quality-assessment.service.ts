import sharp from "sharp";

import { logger } from "../../../lib/logger";

/**
 * Document Quality Assessment (Sprint 21.1).
 *
 * A COMPLETELY INDEPENDENT, read-only quality evaluator that runs immediately
 * AFTER the Document Enhancement stage and BEFORE validation/OCR/Medical AI.
 *
 * IMPORTANT — this service NEVER rejects, blocks, or alters a document. It only
 * inspects the (already enhanced) image bytes and reports a 0–100 quality score
 * plus a coarse HIGH / MEDIUM / LOW band. The orchestrator decides what to do
 * with the result; analysis always continues regardless of the outcome.
 *
 * It reuses the `sharp` decoder already present for enhancement (no new
 * dependency, no new AI model) and only reads image statistics — it produces no
 * output image. Any failure degrades gracefully to a neutral HIGH result so the
 * pipeline is never affected.
 */

/** Coarse quality band derived from the 0–100 score. */
export type DocumentQualityLevel = "HIGH" | "MEDIUM" | "LOW";

/** The outcome of a single document quality assessment. */
export interface DocumentQualityAssessment {
  /** Integer quality score in the range [0, 100]. */
  readonly score: number;
  /** Coarse band: HIGH ≥ 75, MEDIUM 50–74, LOW < 50. */
  readonly level: DocumentQualityLevel;
  /**
   * A user-facing warning when quality is LOW, otherwise `null`. Analysis still
   * continues — this is advisory only.
   */
  readonly warning: string | null;
  /** Individual 0–1 sub-signals, retained for logging/observability. */
  readonly signals: {
    readonly sharpness: number;
    readonly brightness: number;
    readonly contrast: number;
    readonly pageVisibility: number;
    readonly cropQuality: number;
    readonly rotationQuality: number;
  };
}

/** Score at/above which a document is considered HIGH quality. */
const HIGH_THRESHOLD = 75;
/** Score at/above which a document is considered MEDIUM quality. */
const MEDIUM_THRESHOLD = 50;

/** Turkish user-facing advisory shown (never blocking) for LOW quality uploads. */
const LOW_QUALITY_WARNING =
  "Yüklenen görüntü kalitesi düşük görünüyor; analiz doğruluğu azalabilir. " +
  "Daha net, iyi aydınlatılmış ve düz çekilmiş bir fotoğraf yüklemeniz sonuçların doğruluğunu artırabilir.";

/** Clamps a number to the inclusive [0, 1] range. */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Assesses the visual quality of an already-enhanced document.
 *
 * Only raster image uploads are scored; PDFs (which are validated by their text
 * layer, not photographed) return a neutral HIGH result. The method never
 * throws.
 *
 * @param buffer - The enhanced document bytes from the enhancement stage.
 * @param mimeType - The document MIME type.
 * @returns The quality assessment (defaults to neutral HIGH on any failure).
 */
async function assess(buffer: Buffer, mimeType: string): Promise<DocumentQualityAssessment> {
  const neutral: DocumentQualityAssessment = {
    score: 100,
    level: "HIGH",
    warning: null,
    signals: {
      sharpness: 1,
      brightness: 1,
      contrast: 1,
      pageVisibility: 1,
      cropQuality: 1,
      rotationQuality: 1,
    },
  };

  // Quality assessment targets photographed image uploads only.
  if (!mimeType.startsWith("image/")) {
    return neutral;
  }

  try {
    const pipeline = sharp(buffer, { failOn: "none" });
    const [metadata, stats] = await Promise.all([pipeline.metadata(), pipeline.stats()]);

    // Per-channel means/stdevs → approximate luma mean and contrast (0–255).
    const channels = stats.channels.slice(0, 3);
    const meanLuma =
      channels.reduce((sum, c) => sum + c.mean, 0) / Math.max(channels.length, 1);
    const contrastStd =
      channels.reduce((sum, c) => sum + c.stdev, 0) / Math.max(channels.length, 1);

    // 1. Sharpness — sharp reports a focus/sharpness estimate; ~2+ is crisp.
    const sharpnessRaw = typeof stats.sharpness === "number" ? stats.sharpness : 1;
    const sharpness = clamp01(sharpnessRaw / 3);

    // 2. Brightness — best near mid-grey (128); penalise very dark/blown-out.
    const brightness = clamp01(1 - Math.abs(meanLuma - 128) / 128);

    // 3. Contrast — higher spread is better up to a healthy document range.
    const contrast = clamp01(contrastStd / 64);

    // 4. Page visibility — image entropy indicates visible content vs. a blank
    //    or washed-out capture; low entropy means little is legible.
    const entropy = typeof stats.entropy === "number" ? stats.entropy : 5;
    const pageVisibility = clamp01(entropy / 6);

    // 5. Crop quality — proxy from resolution adequacy and a document-like
    //    aspect ratio; tiny or extreme-ratio captures suggest a bad crop.
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const megapixels = (width * height) / 1_000_000;
    const resolutionScore = clamp01(megapixels / 1.5);
    const ratio = width > 0 && height > 0 ? Math.max(width, height) / Math.min(width, height) : 3;
    const ratioScore = clamp01(1 - Math.max(0, ratio - 1.6) / 2);
    const cropQuality = clamp01((resolutionScore + ratioScore) / 2);

    // 6. Rotation quality — enhancement already auto-orients from EXIF, so a
    //    normalised orientation (1/undefined) scores full marks; any residual
    //    non-trivial EXIF orientation indicates a rotated capture.
    const orientation = metadata.orientation ?? 1;
    const rotationQuality = orientation <= 1 ? 1 : orientation <= 4 ? 0.6 : 0.35;

    const signals = {
      sharpness,
      brightness,
      contrast,
      pageVisibility,
      cropQuality,
      rotationQuality,
    };

    // Weighted blend (weights sum to 1). Sharpness and visibility matter most
    // for downstream OCR/vision reliability.
    const weighted =
      0.25 * sharpness +
      0.15 * brightness +
      0.15 * contrast +
      0.2 * pageVisibility +
      0.15 * cropQuality +
      0.1 * rotationQuality;
    const score = Math.round(Math.max(0, Math.min(100, weighted * 100)));

    const level: DocumentQualityLevel =
      score >= HIGH_THRESHOLD ? "HIGH" : score >= MEDIUM_THRESHOLD ? "MEDIUM" : "LOW";
    const warning = level === "LOW" ? LOW_QUALITY_WARNING : null;

    logger.info({ score, level, signals }, "Document quality assessment complete");
    return { score, level, warning, signals };
  } catch (error) {
    logger.warn({ err: error }, "Document quality assessment failed; treating as HIGH (advisory only)");
    return neutral;
  }
}

export const documentQualityAssessmentService = { assess };
