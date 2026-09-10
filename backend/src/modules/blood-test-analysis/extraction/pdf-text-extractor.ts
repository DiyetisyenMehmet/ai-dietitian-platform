import pdfParse from "pdf-parse";

import { logger } from "../../../lib/logger";

/** A malformed/hostile PDF must never keep a synchronous request open forever. */
const PDF_TEXT_EXTRACTION_TIMEOUT_MS = 10_000;
/** Multi-page reports must be inspected as a whole document so page/table layout is preserved. */
const MULTI_PAGE_WHOLE_DOCUMENT_THRESHOLD = 2;

export interface PdfTextInspection {
  /** Flattened text recovered from every page. Validation may use this as evidence. */
  readonly text: string;
  /** Page count reported by the PDF parser, normalized to at least one page. */
  readonly pageCount: number;
}

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
 * Parses a PDF once and exposes both its complete flattened text and page count.
 *
 * This inspection primitive is intentionally separate from
 * {@link extractPdfText}: document validation needs the text from ALL pages as
 * deterministic evidence even when extraction later chooses the original PDF
 * bytes to preserve table/page layout. Returning the full text here prevents a
 * multi-page report from becoming "textless" merely because the extraction
 * policy correctly prefers whole-document vision.
 *
 * The method is fail-soft: malformed/time-limited PDFs return an empty text
 * result with a conservative one-page count, allowing callers to fall back to a
 * document-capable provider instead of hanging the request.
 */
export async function inspectPdfText(buffer: Buffer): Promise<PdfTextInspection> {
  try {
    const result = await withTimeout(pdfParse(buffer), PDF_TEXT_EXTRACTION_TIMEOUT_MS);
    const pageCount = Number.isFinite(result.numpages)
      ? Math.max(1, Math.trunc(result.numpages))
      : 1;
    return {
      text: (result.text ?? "").trim(),
      pageCount,
    };
  } catch (error) {
    logger.warn(
      { err: error },
      "PDF text inspection failed; will fall back to structured/vision processing",
    );
    return { text: "", pageCount: 1 };
  }
}

/**
 * Returns true when a laboratory PDF should bypass the flattened text path and
 * be inspected from the original PDF bytes by the structured vision adapter.
 *
 * `pdf-parse` flattens page/table layout. That is useful for cheap single-page
 * reports, but on a 2+ page report it can make a locally "strong" first page
 * hide biomarkers from later pages. Diewish therefore treats every multi-page
 * PDF as a whole-document extraction case.
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
 * inspection so extraction uses the ORIGINAL PDF bytes and can see every page
 * and table. Validation can still use {@link inspectPdfText} to inspect all text
 * without changing this extraction policy.
 *
 * Returns an empty string (never throws) when the PDF has no extractable text,
 * is multi-page, or parsing exceeds the hard safety timeout. Callers then fall
 * back to structured whole-document extraction rather than leaving the user on
 * an endless spinner.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const inspection = await inspectPdfText(buffer);

  if (shouldPreferWholeDocumentPdfExtraction(inspection.pageCount)) {
    logger.info(
      { pageCount: inspection.pageCount },
      "Multi-page PDF detected; deferring extraction to whole-document structured path",
    );
    return "";
  }

  return inspection.text;
}

/**
 * Counts meaningful Unicode letters and digits in a block of text. Whitespace
 * and punctuation are ignored so a mostly-empty text layer does not defeat the
 * structured/vision fallback threshold. Unicode properties matter for Turkish
 * laboratory text (İ, Ş, Ğ, Ü, Ö, Ç) as well as English abbreviations.
 */
export function meaningfulCharCount(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]/gu);
  return matches ? matches.length : 0;
}
