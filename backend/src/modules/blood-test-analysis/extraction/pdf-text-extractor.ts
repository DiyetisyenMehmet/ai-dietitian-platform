import pdfParse from "pdf-parse";

import { logger } from "../../../lib/logger";

/**
 * Extracts embedded text from a PDF using `pdf-parse`.
 *
 * This is the cheapest and highest-fidelity path: many lab reports are digital
 * PDFs with a real text layer. Returns an empty string (never throws) when the
 * PDF has no extractable text so the caller can fall back to OCR/vision.
 *
 * @param buffer - Raw PDF bytes.
 * @returns The recovered text, or an empty string on failure.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer);
    return (result.text ?? "").trim();
  } catch (error) {
    logger.warn({ err: error }, "PDF text extraction failed; will fall back to OCR/vision");
    return "";
  }
}

/**
 * Counts "meaningful" characters (letters and digits) in a block of text.
 * Whitespace and punctuation are ignored so a mostly-empty text layer does not
 * defeat the OCR-fallback threshold.
 *
 * @param text - Text to measure.
 * @returns The number of alphanumeric characters.
 */
export function meaningfulCharCount(text: string): number {
  const matches = text.match(/[A-Za-z0-9]/g);
  return matches ? matches.length : 0;
}
