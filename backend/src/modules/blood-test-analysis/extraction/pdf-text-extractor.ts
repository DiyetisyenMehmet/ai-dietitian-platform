import pdfParse from "pdf-parse";

import { logger } from "../../../lib/logger";

/** A malformed/hostile PDF must never keep a synchronous request open forever. */
const PDF_TEXT_EXTRACTION_TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`PDF text extraction timed out after ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Extracts embedded text from a PDF using `pdf-parse`.
 *
 * This is the cheapest and highest-fidelity path: many lab reports are digital
 * PDFs with a real text layer. Returns an empty string (never throws) when the
 * PDF has no extractable text or parsing exceeds a hard safety timeout so the
 * caller can fall back to the structured/vision path rather than leave the user
 * on an endless spinner.
 *
 * @param buffer - Raw PDF bytes.
 * @returns The recovered text, or an empty string on failure/timeout.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const result = await withTimeout(pdfParse(buffer), PDF_TEXT_EXTRACTION_TIMEOUT_MS);
    return (result.text ?? "").trim();
  } catch (error) {
    logger.warn({ err: error }, "PDF text extraction failed; will fall back to structured/vision extraction");
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
