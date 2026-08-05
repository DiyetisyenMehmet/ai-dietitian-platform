import { createWorker, PSM } from "tesseract.js";

import { logger } from "../../../lib/logger";

export { PSM };

/** Optional tuning for a single OCR pass. */
export interface OcrOptions {
  /**
   * Tesseract page-segmentation mode. Varying this between attempts lets the
   * caller retry a low-quality OCR pass with a layout strategy better suited to
   * tabular lab reports, without changing the OCR engine or introducing any new
   * model. When omitted, tesseract's default (auto) segmentation is used.
   */
  readonly pageSegMode?: PSM;
}

/**
 * Runs OCR over an image (or rasterized document) buffer using `tesseract.js`.
 *
 * This is the second-tier extraction path, used only when a PDF's text layer is
 * missing or too sparse. English + Turkish traineddata are loaded because
 * Diewish serves Turkish users and lab reports are often bilingual. Returns an
 * empty string (never throws) so the caller can fall back to vision AI.
 *
 * @param buffer - Image bytes (JPEG/PNG/WEBP) or rasterized page.
 * @returns The recognized text, or an empty string on failure.
 */
export async function extractTextWithOcr(
  buffer: Buffer,
  options: OcrOptions = {},
): Promise<string> {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await createWorker("eng+tur");
    if (options.pageSegMode !== undefined) {
      await worker.setParameters({ tessedit_pageseg_mode: options.pageSegMode });
    }
    const { data } = await worker.recognize(buffer);
    return (data.text ?? "").trim();
  } catch (error) {
    logger.warn({ err: error }, "OCR extraction failed; will fall back to vision AI");
    return "";
  } finally {
    if (worker) {
      await worker.terminate().catch(() => undefined);
    }
  }
}
