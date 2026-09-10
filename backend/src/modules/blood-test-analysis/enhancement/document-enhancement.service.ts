import sharp, { Sharp } from "sharp";

import { logger } from "../../../lib/logger";
import { env } from "../../../config/env";
import { extractPdfText, meaningfulCharCount } from "../extraction/pdf-text-extractor";

/**
 * Document Enhancement Pipeline.
 *
 * Runs before blood-test validation so phone photos/scans are normalized once,
 * then the SAME bounded media is used by validation, extraction and Medical AI.
 * The stored original upload is never modified.
 */

const IMAGE_MIME_PREFIX = "image/";
const PDF_MIME = "application/pdf";

/**
 * Vertex inline image data is limited to 7 MB. Keep a full MiB of headroom so
 * encoding/provider boundary differences never turn a valid phone photo into a
 * generic upstream 4xx. This is a limit on the AI-facing derivative only; the
 * original upload may still be larger and remains untouched in storage.
 */
export const VISION_INLINE_IMAGE_BUDGET_BYTES = 6 * 1024 * 1024;
/** Large phone-camera frames provide no useful lab-text gain beyond this edge. */
export const VISION_IMAGE_MAX_LONG_EDGE = 4096;
/** Progressive recovery sizes used only if the first bounded encode is too big. */
const VISION_IMAGE_RETRY_EDGES = [3072, 2560, 2048] as const;

/** Context handed to each enhancement step. */
export interface EnhancementContext {
  readonly mimeType: string;
  readonly brightnessFactor: number;
}

/** A single independent image-preprocessing step. */
export interface EnhancementStep {
  readonly name: string;
  apply(pipeline: Sharp, ctx: EnhancementContext): Sharp;
}

/** Result of running the whole enhancement pipeline. */
export interface DocumentEnhancementResult {
  /** Final derivative for validation/extraction/AI. */
  readonly buffer: Buffer;
  /** MIME type of `buffer` (may change from PNG to JPEG only as a last size fallback). */
  readonly mimeType: string;
  readonly appliedSteps: string[];
  readonly skipped: boolean;
}

/**
 * Ordered, conservative preprocessing. No medical interpretation happens here.
 */
export const IMAGE_ENHANCEMENT_STEPS: EnhancementStep[] = [
  {
    name: "auto-orient-exif",
    apply: (p) => p.rotate(),
  },
  {
    name: "normalize-rotation",
    apply: (p) => p,
  },
  {
    name: "auto-contrast",
    apply: (p) => p.normalize(),
  },
  {
    name: "brightness-normalize",
    apply: (p, ctx) =>
      ctx.brightnessFactor !== 1 ? p.modulate({ brightness: ctx.brightnessFactor }) : p,
  },
];

const BRIGHTNESS_TARGET = 128;
const BRIGHTNESS_MIN = 0.7;
const BRIGHTNESS_MAX = 1.4;

type SupportedRasterFormat = "jpeg" | "png" | "webp";

function mimeForFormat(format: SupportedRasterFormat): string {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  return "image/webp";
}

function encodeFormat(pipeline: Sharp, format: SupportedRasterFormat, compact: boolean): Sharp {
  switch (format) {
    case "jpeg":
      return pipeline.jpeg({
        quality: compact ? 86 : 92,
        chromaSubsampling: "4:2:0",
        progressive: true,
      });
    case "png":
      return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
    case "webp":
      return pipeline.webp({ quality: compact ? 86 : 92, smartSubsample: true });
  }
}

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

async function encodeAtEdge(
  buffer: Buffer,
  format: SupportedRasterFormat,
  edge: number,
): Promise<Buffer> {
  let pipeline = sharp(buffer, { failOn: "none" }).resize({
    width: edge,
    height: edge,
    fit: "inside",
    withoutEnlargement: true,
  });
  pipeline = encodeFormat(pipeline, format, true);
  return pipeline.toBuffer();
}

/**
 * Enforces the provider byte budget after the normal enhancement encode.
 *
 * We progressively reduce only an oversized AI-facing derivative. PNG is kept
 * lossless as long as it fits; if a high-entropy PNG still exceeds the inline
 * budget at 2048px, it is flattened onto white and converted to a high-quality
 * JPEG. Laboratory text remains comfortably readable while the request is kept
 * below the provider hard limit. The original stored file is unaffected.
 */
async function enforceVisionByteBudget(
  buffer: Buffer,
  format: SupportedRasterFormat,
): Promise<{ buffer: Buffer; mimeType: string; converted: boolean }> {
  if (buffer.length <= VISION_INLINE_IMAGE_BUDGET_BYTES) {
    return { buffer, mimeType: mimeForFormat(format), converted: false };
  }

  for (const edge of VISION_IMAGE_RETRY_EDGES) {
    const candidate = await encodeAtEdge(buffer, format, edge);
    if (candidate.length <= VISION_INLINE_IMAGE_BUDGET_BYTES) {
      return { buffer: candidate, mimeType: mimeForFormat(format), converted: false };
    }
  }

  // Lossless PNG can remain large even after resizing when it contains camera
  // noise. JPEG is a safe final transport derivative for a laboratory page.
  if (format === "png") {
    for (const edge of [2048, 1600] as const) {
      const candidate = await sharp(buffer, { failOn: "none" })
        .flatten({ background: "#ffffff" })
        .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 86, chromaSubsampling: "4:2:0", progressive: true })
        .toBuffer();
      if (candidate.length <= VISION_INLINE_IMAGE_BUDGET_BYTES) {
        return { buffer: candidate, mimeType: "image/jpeg", converted: true };
      }
    }
  }

  // JPEG/WebP at 1600px should fit ordinary phone imagery. Keep one final
  // deterministic attempt so an oversized derivative never reaches Vertex.
  const finalCandidate = await sharp(buffer, { failOn: "none" })
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, chromaSubsampling: "4:2:0", progressive: true })
    .toBuffer();
  return { buffer: finalCandidate, mimeType: "image/jpeg", converted: format !== "jpeg" };
}

export const documentEnhancementService = {
  async enhance(buffer: Buffer, mimeType: string): Promise<DocumentEnhancementResult> {
    if (mimeType === PDF_MIME) {
      const text = await extractPdfText(buffer).catch(() => "");
      if (meaningfulCharCount(text) >= env.BLOOD_TEST_TEXT_MIN_CHARS) {
        logger.info("Enhancement: clean text-layer PDF → skipped");
        return { buffer, mimeType, appliedSteps: [], skipped: true };
      }
      logger.info("Enhancement: scanned/image-only PDF → pass-through");
      return { buffer, mimeType, appliedSteps: [], skipped: false };
    }

    if (!mimeType.startsWith(IMAGE_MIME_PREFIX)) {
      return { buffer, mimeType, appliedSteps: [], skipped: false };
    }

    try {
      const meta = await sharp(buffer, { failOn: "none" }).metadata();
      if (meta.format !== "jpeg" && meta.format !== "png" && meta.format !== "webp") {
        logger.warn({ format: meta.format }, "Enhancement: unsupported raster format; pass-through");
        return { buffer, mimeType, appliedSteps: [], skipped: false };
      }

      const sourceFormat = meta.format;
      const brightnessFactor = await computeBrightnessFactor(buffer);
      const ctx: EnhancementContext = { mimeType, brightnessFactor };

      let pipeline = sharp(buffer, { failOn: "none" });
      const applied: string[] = [];
      for (const step of IMAGE_ENHANCEMENT_STEPS) {
        pipeline = step.apply(pipeline, ctx);
        applied.push(step.name);
      }

      // Cap extreme phone-camera dimensions before the first encode. This is a
      // transport/readability optimization, not a change to the stored original.
      pipeline = pipeline.resize({
        width: VISION_IMAGE_MAX_LONG_EDGE,
        height: VISION_IMAGE_MAX_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });
      pipeline = encodeFormat(pipeline, sourceFormat, false);

      const firstPass = await pipeline.toBuffer();
      const bounded = await enforceVisionByteBudget(firstPass, sourceFormat);
      const outMeta = await sharp(bounded.buffer, { failOn: "none" }).metadata();

      logger.info(
        {
          appliedSteps: applied,
          sourceFormat,
          outputMimeType: bounded.mimeType,
          sourceWidth: meta.width,
          sourceHeight: meta.height,
          outputWidth: outMeta.width,
          outputHeight: outMeta.height,
          inputBytes: buffer.length,
          firstPassBytes: firstPass.length,
          outputBytes: bounded.buffer.length,
          converted: bounded.converted,
          brightnessFactor,
        },
        "Enhancement: image preprocessing and Vertex payload bounding applied",
      );

      return {
        buffer: bounded.buffer,
        mimeType: bounded.mimeType,
        appliedSteps: applied,
        skipped: false,
      };
    } catch (error) {
      logger.warn(
        { err: error, inputBytes: buffer.length, mimeType },
        "Enhancement: image preprocessing failed; using original buffer",
      );
      return { buffer, mimeType, appliedSteps: [], skipped: false };
    }
  },
};
