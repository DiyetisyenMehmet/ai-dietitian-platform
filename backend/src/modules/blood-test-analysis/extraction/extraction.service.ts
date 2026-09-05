import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { getAIAdapter } from "../ai-adapter/ai-adapter.factory";
import { matchBiomarkerCode } from "../normalization/biomarker-aliases.map";
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
/** Structural PDF labels that can look like a laboratory row to a generic regex. */
const DOCUMENT_METADATA_LABEL_REGEX = /^(?:sayfa|page)$/iu;

/**
 * A text-layer PDF is accepted locally only when it yielded enough structured
 * rows to be trustworthy. A PDF can contain plenty of text yet still expose a
 * column-oriented layout that the line parser cannot reconstruct. In that case
 * we use one structured-AI pass over the already extracted TEXT (not the whole
 * PDF) before the later safety gate. This keeps the common path cheap while
 * avoiding false rejections of genuine digital laboratory reports.
 */
const PDF_LOCAL_MIN_VALUES = 6;
const PDF_LOCAL_MIN_NUMERIC_VALUES = 5;
const PDF_LOCAL_MIN_VALUES_WITH_UNITS = 4;
const PDF_LOCAL_MIN_REFERENCE_RANGES = 3;
const PDF_LOCAL_MIN_CANONICAL_BIOMARKERS = 3;

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

function comparableNumber(raw: string): number | null {
  const cleaned = raw.replace(/[<>≤≥\s]/g, "").replace(",", ".");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

function comparableUnit(unit: string | undefined): string {
  return (unit ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, "")
    .replace(/[µμ]/g, "u");
}

function extractionRichness(value: ExtractedBloodTestValue): number {
  return (value.referenceRange?.trim() ? 2 : 0) + (value.unit?.trim() ? 1 : 0);
}

/**
 * Removes equivalent duplicate rows without collapsing genuinely different
 * measurements. e-Nabız exports can repeat the same analyte under both a long
 * name and an abbreviation (for example HGB and Hb). We only merge rows when
 * they resolve to the same canonical biomarker AND carry the same numeric value
 * with compatible units. Different values/units remain separate for later
 * normalization instead of being guessed away.
 */
function dedupeEquivalentCanonicalValues(
  values: ExtractedBloodTestValue[],
): ExtractedBloodTestValue[] {
  const result: ExtractedBloodTestValue[] = [];

  for (const value of values) {
    const code = matchBiomarkerCode(value.name);
    const numeric = comparableNumber(value.rawValue);
    if (!code || numeric === null) {
      result.push(value);
      continue;
    }

    const unit = comparableUnit(value.unit);
    const duplicateIndex = result.findIndex((candidate) => {
      if (matchBiomarkerCode(candidate.name) !== code) return false;
      const candidateNumeric = comparableNumber(candidate.rawValue);
      if (candidateNumeric === null || Math.abs(candidateNumeric - numeric) > 1e-9) return false;
      const candidateUnit = comparableUnit(candidate.unit);
      return !unit || !candidateUnit || unit === candidateUnit;
    });

    if (duplicateIndex === -1) {
      result.push(value);
      continue;
    }

    const existing = result[duplicateIndex];
    if (extractionRichness(value) > extractionRichness(existing)) {
      result[duplicateIndex] = value;
    }
  }

  return result;
}

/**
 * Parses raw laboratory-report text into structured biomarker values using a
 * line-oriented heuristic. Each line is expected to contain a label, a numeric
 * value, an optional unit and, when printed on the same line, a reference range.
 *
 * CBC reports commonly use labels such as BASO#, NEUT%, RDW-CV, P-LCR and
 * %Hb A1c. The label grammar deliberately supports `#` and `%` so these rows are
 * not silently discarded merely because of the laboratory's abbreviation.
 *
 * @param text - Raw text recovered from a report.
 * @returns The best-effort structured values (may be empty).
 */
function parseLabText(text: string): ExtractedBloodTestValue[] {
  const values: ExtractedBloodTestValue[] = [];
  const seen = new Set<string>();
  const lineRegex =
    /^\s*([%A-Za-zÀ-ÿğüşıöçĞÜŞİÖÇ][%#A-Za-zÀ-ÿğüşıöçĞÜŞİÖÇ0-9()./+\s-]{1,64}?)[\s:]+([<>≤≥]?\s*[-+]?\d[\d.,]*)\s*([%A-Za-zµμ/^0-9xX··.-]{1,20})?/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 3) continue;
    const match = line.match(lineRegex);
    if (!match) continue;

    const name = match[1].trim().replace(/\s{2,}/g, " ");
    const value = match[2].replace(/\s+/g, "");
    const rawUnit = match[3]?.trim();
    // A bare dash on many exported laboratory PDFs means "no unit", not a
    // literal unit. Keeping it as a unit would make a reference comparison look
    // more authoritative than the source actually is.
    const unit = rawUnit && rawUnit !== "-" ? rawUnit : undefined;
    const remainder = line.slice(match[0].length).trim();
    const referenceRange = remainder.match(REFERENCE_RANGE_VALUE_REGEX)?.[0]?.trim();

    // Skip obvious non-biomarker lines (dates, ids, page numbers).
    if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(line)) continue;
    if (name.length < 2) continue;

    const key = name.toLocaleLowerCase("tr-TR");
    if (DOCUMENT_METADATA_LABEL_REGEX.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    values.push({
      name,
      rawValue: value,
      unit,
      referenceRange: referenceRange && referenceRange.length > 0 ? referenceRange : undefined,
    });
  }

  return dedupeEquivalentCanonicalValues(values);
}

function localPdfExtractionIsStrong(values: ExtractedBloodTestValue[]): boolean {
  const numericValues = values.filter((value) => /\d/.test(value.rawValue)).length;
  const valuesWithUnits = values.filter((value) => Boolean(value.unit?.trim())).length;
  const valuesWithReferenceRanges = values.filter((value) => Boolean(value.referenceRange?.trim())).length;
  const canonicalCodes = new Set(
    values
      .map((value) => matchBiomarkerCode(value.name))
      .filter((code): code is string => code !== null),
  );

  return (
    values.length >= PDF_LOCAL_MIN_VALUES &&
    numericValues >= PDF_LOCAL_MIN_NUMERIC_VALUES &&
    valuesWithUnits >= PDF_LOCAL_MIN_VALUES_WITH_UNITS &&
    valuesWithReferenceRanges >= PDF_LOCAL_MIN_REFERENCE_RANGES &&
    canonicalCodes.size >= PDF_LOCAL_MIN_CANONICAL_BIOMARKERS
  );
}

function extractionKey(name: string): string {
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/[()[\]:.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Merges a model-assisted text extraction into the deterministic parse without
 * replacing values that were read directly from the PDF text. The model may
 * fill a missing unit/reference range for an existing row and may add rows the
 * line parser could not reconstruct. This is extraction only; the later
 * validation and normalization gates remain authoritative.
 */
function mergeTextExtractions(
  localValues: ExtractedBloodTestValue[],
  assistedValues: ExtractedBloodTestValue[],
): ExtractedBloodTestValue[] {
  const merged = new Map<string, ExtractedBloodTestValue>();

  for (const value of localValues) {
    merged.set(extractionKey(value.name), { ...value });
  }
  for (const value of assistedValues) {
    const key = extractionKey(value.name);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...value });
      continue;
    }
    merged.set(key, {
      ...existing,
      unit: existing.unit ?? value.unit,
      referenceRange: existing.referenceRange ?? value.referenceRange,
    });
  }

  return dedupeEquivalentCanonicalValues(Array.from(merged.values()));
}

/**
 * The hybrid, cost-optimized extraction pipeline for Diewish blood-test
 * documents. Selection order:
 *
 *  1. **TEXT** — `pdf-parse` for PDFs (cheapest, highest fidelity).
 *  2. **STRUCTURED TEXT FALLBACK** — only when a genuine text-rich PDF was
 *     locally parsed too weakly; sends recovered text, not the PDF binary.
 *  3. **OCR** — `tesseract.js` for unknown raster-like input.
 *  4. **VISION** — a vision-capable LLM as the final fallback, and the direct
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
        const localValues = parseLabText(text);
        if (localPdfExtractionIsStrong(localValues)) {
          logger.info(
            { chars: text.length, extractedCount: localValues.length },
            "Extraction: PDF text layer → deterministic TEXT path",
          );
          return { method: "TEXT", rawText: text, values: localValues };
        }

        // The document has a real text layer but its column layout defeated the
        // line parser. Because the document-validation gate runs before this
        // service, a single structured AI pass over the extracted text is a
        // controlled fallback that improves genuine-report recall without
        // weakening random-document rejection.
        try {
          const assisted = await getAIAdapter().extractBloodTestValues(text, "text/plain");
          const mergedValues = mergeTextExtractions(localValues, assisted.values);
          logger.info(
            {
              chars: text.length,
              localCount: localValues.length,
              assistedCount: assisted.values.length,
              mergedCount: mergedValues.length,
            },
            "Extraction: weak PDF text parse → structured text fallback",
          );
          return { method: "TEXT", rawText: text, values: mergedValues };
        } catch (error) {
          // Do not turn an optional recovery path into a new failure mode. The
          // later structural gate will decide whether the deterministic parse is
          // sufficient; if it is not, the document still fails closed.
          logger.warn(
            { err: error, localCount: localValues.length },
            "Structured PDF text fallback failed; continuing with deterministic parse",
          );
          return { method: "TEXT", rawText: text, values: localValues };
        }
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