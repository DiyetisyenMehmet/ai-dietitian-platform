import pdfParse from "pdf-parse";

import { logger } from "../../../lib/logger";

/** A malformed/hostile PDF must never keep a synchronous request open forever. */
const PDF_TEXT_EXTRACTION_TIMEOUT_MS = 10_000;
/** Multi-page reports must be inspected as a whole document so page/table layout is preserved. */
const MULTI_PAGE_WHOLE_DOCUMENT_THRESHOLD = 2;

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
 * Returns true when a laboratory PDF should bypass the flattened text path and
 * be inspected from the original PDF bytes by the structured vision adapter.
 *
 * `pdf-parse` flattens page/table layout. That is useful for cheap single-page
 * reports, but on a 2+ page report it can make a locally "strong" first page
 * hide biomarkers from later pages. Diewish therefore treats every multi-page
 * PDF as a whole-document extraction case. Both the validation and extraction
 * callers already interpret an empty text result as "send the original PDF to
 * the vision-capable adapter", so this policy keeps those two gates aligned.
 */
export function shouldPreferWholeDocumentPdfExtraction(pageCount: number): boolean {
  return Number.isFinite(pageCount) && pageCount >= MULTI_PAGE_WHOLE_DOCUMENT_THRESHOLD;
}

/**
 * Extracts embedded text from a PDF using `pdf-parse` when a flattened text
 * representation is safe for the extraction policy.
 *
 * Single-page digital laboratory PDFs keep the inexpensive text-first path.
 * Multi-page PDFs intentionally return an empty sentinel after page-count
 * inspection so validation/extraction use the ORIGINAL PDF bytes and can see
 * every page and table. This does not discard the upload; it only chooses the
 * higher-fidelity downstream path.
 *
 * Returns an empty string (never throws) when the PDF has no extractable text,
 * is multi-page, or parsing exceeds the hard safety timeout. Callers then fall
 * back to structured whole-document extraction rather than leaving the user on
 * an endless spinner.
 *
 * @param buffer - Raw PDF bytes.
 * @returns Recovered single-page text, or an empty sentinel for whole-document fallback.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const result = await withTimeout(pdfParse(buffer), PDF_TEXT_EXTRACTION_TIMEOUT_MS);
    const pageCount = Number.isFinite(result.numpages) ? Math.max(1, Math.trunc(result.numpages)) : 1;

    if (shouldPreferWholeDocumentPdfExtraction(pageCount)) {
      logger.info(
        { pageCount },
        "Multi-page PDF detected; deferring to whole-document structured extraction",
      );
      return "";
    }

    return (result.text ?? "").trim();
  } catch (error) {
    logger.warn(
      { err: error },
      "PDF text extraction failed; will fall back to structured/vision extraction",
    );
    return "";
  }
}

/**
 * Counts meaningful Unicode letters and digits in a block of text. Whitespace
 * and punctuation are ignored so a mostly-empty text layer does not defeat the
 * structured/vision fallback threshold. Unicode properties matter for Turkish
 * laboratory text (İ, Ş, Ğ, Ü, Ö, Ç) as well as English abbreviations.
 *
 * @param text - Text to measure.
 * @returns The number of Unicode letters/digits.
 */
export function meaningfulCharCount(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]/gu);
  return matches ? matches.length : 0;
}
