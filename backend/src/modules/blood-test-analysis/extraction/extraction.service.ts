import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import type { ExtractedBloodTestValue, ExtractionResult } from "../types";
import { extractTextWithOcr } from "./ocr-extractor";
import { extractPdfText, meaningfulCharCount } from "./pdf-text-extractor";
import { extractWithVision } from "./vision-extractor";

const PDF_MIME = "application/pdf";

/**
 * Parses raw laboratory-report text into structured biomarker values using a
 * line-oriented heuristic. Each line is expected to contain a label, a numeric
 * value (optionally prefixed with `<`/`>`), and an optional unit.
 *
 * @param text - Raw text recovered from a report.
 * @returns The best-effort structured values (may be empty).
 */
function parseLabText(text: string): ExtractedBloodTestValue[] {
  const values: ExtractedBloodTestValue[] = [];
  const seen = new Set<string>();
  const lineRegex =
    /^\s*([A-Za-zÀ-ÿğüşıöçĞÜŞİÖÇ][A-Za-zÀ-ÿğüşıöçĞÜŞİÖÇ0-9()./\s-]{1,48}?)[\s:]+([<>]?\s*\d[\d.,]*)\s*([%A-Za-zµ/^0-9··.-]{1,16})?/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 3) continue;
    const match = line.match(lineRegex);
    if (!match) continue;

    const name = match[1].trim().replace(/\s{2,}/g, " ");
    const value = match[2].replace(/\s+/g, "");
    const unit = match[3]?.trim();

    // Skip obvious non-biomarker lines (dates, ids, page numbers).
    if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(line)) continue;
    if (name.length < 2) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    values.push({ name, rawValue: value, unit: unit && unit.length > 0 ? unit : undefined });
  }

  return values;
}

/**
 * The hybrid, cost-optimized extraction pipeline for Diewish blood-test
 * documents. Selection order:
 *
 *  1. **TEXT** — `pdf-parse` for PDFs (cheapest, highest fidelity).
 *  2. **OCR** — `tesseract.js` when the text layer is missing/too sparse.
 *  3. **VISION** — a vision-capable LLM as the final fallback, and the direct
 *     path for image uploads (which have no text layer).
 *
 * The method actually used is returned so it can be persisted in the analysis
 * metadata.
 */
export const extractionService = {
  /**
   * Runs the hybrid extraction pipeline over a document buffer.
   *
   * @param buffer - Raw document bytes loaded from storage.
   * @param mimeType - Detected MIME type of the document.
   * @returns The extraction result including the method used.
   */
  async extract(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
    const minChars = env.BLOOD_TEST_TEXT_MIN_CHARS;

    // Images have no text layer — go straight to vision AI.
    if (mimeType.startsWith("image/")) {
      logger.info({ mimeType }, "Extraction: image upload → vision path");
      const vision = await extractWithVision(buffer, mimeType);
      return { method: "VISION", rawText: vision.rawText, values: vision.values };
    }

    if (mimeType === PDF_MIME) {
      // 1. Text layer.
      const text = await extractPdfText(buffer);
      if (meaningfulCharCount(text) >= minChars) {
        logger.info({ chars: text.length }, "Extraction: PDF text layer → TEXT path");
        return { method: "TEXT", rawText: text, values: parseLabText(text) };
      }

      // 2. Vision fallback for scanned / image-only PDFs.
      //
      // IMPORTANT: `tesseract.js` can only decode raster images — it CANNOT
      // read PDF bytes. Passing a PDF buffer to it makes the underlying worker
      // throw "Error attempting to read image", and because that failure is
      // emitted asynchronously from the worker thread it escapes a normal
      // try/catch and becomes a FATAL uncaught exception that crashes the whole
      // backend process. A scanned/image-only lab-report PDF (no text layer) is
      // common, so the OCR step must be skipped for PDFs and the document sent
      // straight to the vision model, which reads image-only PDFs natively.
      logger.info("Extraction: sparse PDF text layer → VISION path");
      const vision = await extractWithVision(buffer, mimeType);
      return { method: "VISION", rawText: vision.rawText, values: vision.values };
    }

    // Unknown type: attempt OCR, then vision.
    const ocrText = await extractTextWithOcr(buffer);
    if (meaningfulCharCount(ocrText) >= minChars) {
      return { method: "OCR", rawText: ocrText, values: parseLabText(ocrText) };
    }
    const vision = await extractWithVision(buffer, mimeType);
    return { method: "VISION", rawText: vision.rawText, values: vision.values };
  },
};
