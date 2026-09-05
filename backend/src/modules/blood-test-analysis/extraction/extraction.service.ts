import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import type { ExtractedBloodTestValue, ExtractionResult } from "../types";
import { extractTextWithOcr, PSM } from "./ocr-extractor";
import { extractPdfText, meaningfulCharCount } from "./pdf-text-extractor";
import { extractWithVision } from "./vision-extractor";

const PDF_MIME = "application/pdf";

/** Each of the four OCR-quality signals contributes up to this many points. */
const OCR_QUALITY_WEIGHT = 25;
/** Parameter count treated as a "complete" panel when scoring. */
const OCR_QUALITY_TARGET_PARAMS = 8;
/** OCR quality (0–100) at/above which the first pass is accepted as-is. */
const OCR_QUALITY_ACCEPT_THRESHOLD = 85;
/** Detects a printed reference range such as "10-20", "10 - 20", "3.5–5.1". */
const REFERENCE_RANGE_REGEX = /\d[\d.,]*\s*[-–—]\s*\d[\d.,]*/;
/** Also accepts one-sided laboratory ranges such as "<100" or "> 40". */
const REFERENCE_RANGE_VALUE_REGEX =
  /(?:[<>≤≥]\s*\d[\d.,]*|\d[\d.,]*\s*[-–—]\s*\d[\d.,]*)/;

/**
 * Estimates OCR quality on a 0–100 scale from data that OCR already produced.
 * No new AI model is introduced: this is a pure heuristic over the structured
 * values plus the raw text. It blends four equally-weighted signals — how many
 * parameters were detected, and the share of values carrying a numeric reading,
 * a unit, and a reference range — so a garbled OCR pass scores low and triggers
 * a single retry.
 *
 * @param values - Structured biomarker values parsed from an OCR pass.
 * @param rawText - The raw OCR text (used to detect printed reference ranges).
 * @returns An integer quality score in the range [0, 100].
 */
function computeOcrQualityScore(values: ExtractedBloodTestValue[], rawText: string): number {
  if (values.length === 0) return 0;

  const total = values.length;
  const numericPct = values.filter((v) => /\d/.test(v.rawValue)).length / total;
  const unitsPct = values.filter((v) => v.unit && v.unit.length > 0).length / total;

  const refRangeLines = rawText
    .split(/\r?\n/)
    .filter((line) => REFERENCE_RANGE_REGEX.test(line)).length;
  const refRangePct = Math.min(refRangeLines / total, 1);

  const paramsScore = Math.min(total / OCR_QUALITY_TARGET_PARAMS, 1);

  const score = OCR_QUALITY_WEIGHT * (paramsScore + numericPct + unitsPct + refRangePct);
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Parses raw laboratory-report text into structured biomarker values using a
 * line-oriented heuristic. Each line is expected to contain a label, a numeric
 * value, an optional unit and, when printed on the same line, a reference range.
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
    const remainder = line.slice(match[0].length).trim();
    const referenceRange = remainder.match(REFERENCE_RANGE_VALUE_REGEX)?.[0]?.trim();

    // Skip obvious non-biomarker lines (dates, ids, page numbers).
    if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(line)) continue;
    if (name.length < 2) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    values.push({
      name,
      rawValue: value,
      unit: unit && unit.length > 0 ? unit : undefined,
      referenceRange: referenceRange && referenceRange.length > 0 ? referenceRange : undefined,
    });
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
    //
    // OCR reliability improvement (same engine, no new models): after the first
    // pass we score its quality from the data it produced. If the score is below
    // the accept threshold we run exactly ONE more pass over the SAME already
    // enhanced buffer using a table-oriented page-segmentation mode, then keep
    // whichever pass scored higher.
    let ocrText = await extractTextWithOcr(buffer);
    let ocrValues = parseLabText(ocrText);
    let ocrScore = computeOcrQualityScore(ocrValues, ocrText);

    if (ocrScore < OCR_QUALITY_ACCEPT_THRESHOLD) {
      const retryText = await extractTextWithOcr(buffer, { pageSegMode: PSM.SINGLE_BLOCK });
      const retryValues = parseLabText(retryText);
      const retryScore = computeOcrQualityScore(retryValues, retryText);
      logger.info(
        { firstScore: ocrScore, retryScore },
        "OCR quality below threshold → ran one retry with table layout mode",
      );
      if (retryScore > ocrScore) {
        ocrText = retryText;
        ocrValues = retryValues;
        ocrScore = retryScore;
      }
    }

    if (meaningfulCharCount(ocrText) >= minChars) {
      logger.info({ ocrScore }, "Extraction: OCR path");
      return { method: "OCR", rawText: ocrText, values: ocrValues };
    }
    const vision = await extractWithVision(buffer, mimeType);
    return { method: "VISION", rawText: vision.rawText, values: vision.values };
  },
};
