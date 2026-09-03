import sharp from "sharp";

import { ApiError } from "../../utils/api-error";
import { FOOD_IMAGE_MIN_CONFIDENCE, FOOD_IMAGE_REJECTION_MESSAGE } from "./constants";
import { analyzeFoodImageWithProvider } from "./food-vision.provider";
import type { FoodScanResult } from "./types";

/**
 * Cheap deterministic quality gate. Only provably unusable images are rejected
 * here; semantic food-vs-object classification remains the vision model's job.
 */
async function assertUsableImage(buffer: Buffer): Promise<Buffer> {
  try {
    let pipeline = sharp(buffer, { failOn: "error" }).rotate();
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height) {
      throw new ApiError(422, "Görsel okunamadı. Lütfen farklı bir fotoğraf deneyin.", {
        code: "FOOD_IMAGE_UNREADABLE",
      });
    }
    if (metadata.width < 160 || metadata.height < 160) {
      throw new ApiError(
        422,
        "Görsel çok küçük. Yemeğin net göründüğü daha büyük bir fotoğraf yükleyin.",
        { code: "FOOD_IMAGE_TOO_SMALL" },
      );
    }

    // Normalize before the external call: lowers upload/token cost and strips
    // unnecessary metadata while preserving enough detail for classification.
    pipeline = pipeline.resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true,
    });
    const normalized = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const stats = await sharp(normalized).stats();
    const channels = stats.channels.slice(0, 3);
    const avgMean =
      channels.reduce((sum, channel) => sum + channel.mean, 0) / Math.max(1, channels.length);
    const avgStdev =
      channels.reduce((sum, channel) => sum + channel.stdev, 0) / Math.max(1, channels.length);

    const nearWhite = avgMean > 246 && avgStdev < 7;
    const nearBlack = avgMean < 9 && avgStdev < 7;
    const nearSolid = avgStdev < 3.5;
    if (nearWhite || nearBlack || nearSolid) {
      throw new ApiError(
        422,
        "Fotoğraf boş veya analiz edilemeyecek kadar tekdüze görünüyor. Lütfen yemeğin net göründüğü bir fotoğraf çekin.",
        { code: "FOOD_IMAGE_BLANK" },
      );
    }
    return normalized;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "Görsel okunamadı. Lütfen JPG, PNG veya WebP biçiminde geçerli bir fotoğraf deneyin.", {
      code: "FOOD_IMAGE_UNREADABLE",
    });
  }
}

export const foodScanService = {
  async analyze(buffer: Buffer): Promise<FoodScanResult> {
    const normalized = await assertUsableImage(buffer);
    const result = await analyzeFoodImageWithProvider(normalized, "image/jpeg");

    if (
      !result.isFood ||
      result.confidence < FOOD_IMAGE_MIN_CONFIDENCE ||
      result.items.length === 0
    ) {
      throw new ApiError(422, FOOD_IMAGE_REJECTION_MESSAGE, {
        code: "NOT_A_FOOD_IMAGE",
        // Confidence is not sensitive and helps debug threshold behavior.
        details: { confidence: result.confidence },
      });
    }

    return result;
  },
};
