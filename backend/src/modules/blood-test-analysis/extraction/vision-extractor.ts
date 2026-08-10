import { getAIAdapter } from "../ai-adapter/ai-adapter.factory";
import type { ExtractedBloodTestValues } from "../types";

/**
 * Extracts laboratory values from a document image using the vision-capable AI
 * adapter.
 *
 * This is the most expensive extraction path and the last resort: it is used
 * directly for image uploads (which have no text layer) and as the final
 * fallback when both text extraction and OCR fail for a PDF.
 *
 * @param buffer - Raw image/document bytes.
 * @param mimeType - MIME type of the buffer (e.g. `image/png`).
 * @returns The structured values recovered by the vision model.
 */
export async function extractWithVision(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractedBloodTestValues> {
  const adapter = getAIAdapter();
  return adapter.extractBloodTestValues(buffer, mimeType);
}
