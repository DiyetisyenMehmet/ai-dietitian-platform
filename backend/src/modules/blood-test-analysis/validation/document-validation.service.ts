/**
 * Blood Test Validation Pipeline.
 *
 * Cost/safety order:
 *  1. Deterministic checks first whenever the document exposes enough text.
 *  2. External AI classification only for genuinely ambiguous/scanned content.
 *  3. Hard validation gate before extraction/medical interpretation.
 *
 * This keeps obvious invoices/unrelated PDFs from spending AI credits and lets
 * structurally obvious text-based laboratory reports pass without an AI call.
 */

import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { ApiError } from "../../../utils/api-error";
import { getAIAdapter } from "../ai-adapter/ai-adapter.factory";
import { extractPdfText, meaningfulCharCount } from "../extraction/pdf-text-extractor";
import {
  BLOOD_TEST_VALIDATION_REJECTION_MESSAGE,
  KNOWN_BLOOD_TEST_PARAMETERS,
} from "./document-validation.constants";
import type { DocumentValidationResult } from "./document-validation.types";

const PDF_MIME = "application/pdf";

/** Words that strongly suggest a laboratory-result layout. */
const LAB_STRUCTURE_TERMS = [
  "referans",
  "reference",
  "sonuç",
  "sonuc",
  "result",
  "birim",
  "unit",
  "hemogram",
  "biyokimya",
  "laboratuvar",
  "laboratory",
];

/** Obvious unrelated-document signals used only for a high-confidence reject. */
const UNRELATED_DOCUMENT_TERMS = [
  "fatura",
  "invoice",
  "irsaliye",
  "reçete",
  "recete",
  "prescription",
  "kimlik",
  "identity card",
  "passport",
  "ehliyet",
  "driver license",
  "sözleşme",
  "sozlesme",
  "contract",
  "whatsapp",
];

/**
 * Deterministically counts recognizable laboratory parameters in recovered
 * text. This is deliberately conservative: recognition helps establish
 * structure, but medical interpretation remains a separate later stage.
 */
function countKnownParameters(text: string): string[] {
  const haystack = text.toLocaleLowerCase("tr-TR");
  const found = new Set<string>();
  for (const param of KNOWN_BLOOD_TEST_PARAMETERS) {
    if (haystack.includes(param.toLocaleLowerCase("tr-TR"))) found.add(param);
  }
  return Array.from(found);
}

function includesAny(text: string, terms: readonly string[]): boolean {
  const haystack = text.toLocaleLowerCase("tr-TR");
  return terms.some((term) => haystack.includes(term));
}

/**
 * Looks for repeated value/unit-like rows without interpreting the values.
 * Examples matched include "5.4 mg/dL", "12,8 g/dL", "4.2 mmol/L".
 */
function countValueUnitPairs(text: string): number {
  const matches = text.match(/\b\d+(?:[.,]\d+)?\s*(?:mg\/dL|g\/dL|mmol\/L|µmol\/L|umol\/L|mIU\/L|IU\/L|U\/L|ng\/mL|pg\/mL|fL|%|10\^?\d+\/L)\b/gi);
  return matches?.length ?? 0;
}

function deterministicVerdict(text: string): DocumentValidationResult | null {
  const parameters = countKnownParameters(text);
  const hasLabTerms = includesAny(text, LAB_STRUCTURE_TERMS);
  const valueUnitPairs = countValueUnitPairs(text);
  const hasUnrelatedTerms = includesAny(text, UNRELATED_DOCUMENT_TERMS);
  const minimum = env.BLOOD_TEST_VALIDATION_MIN_PARAMETERS;

  // Strong positive: several known biomarkers PLUS clear laboratory table
  // vocabulary PLUS repeated numeric/unit structure. This is enough to establish
  // document class without paying an external model; it does NOT interpret data.
  if (
    parameters.length >= Math.max(minimum, 5) &&
    hasLabTerms &&
    valueUnitPairs >= Math.max(minimum, 3)
  ) {
    return {
      classification: "VALID",
      confidence: 100,
      hospital: null,
      reportDate: null,
      patient: null,
      barcode: null,
      hasLabTable: true,
      parameterCount: parameters.length,
      detectedParameters: parameters,
      reason: "Deterministic laboratory structure match.",
    };
  }

  // Strong negative: an unrelated-document marker and no meaningful biomarker/
  // lab structure. Reject locally with zero AI cost. Ambiguous documents are
  // intentionally NOT rejected here; they continue to AI classification.
  if (hasUnrelatedTerms && parameters.length < minimum && !hasLabTerms) {
    return {
      classification: "INVALID",
      confidence: 100,
      hospital: null,
      reportDate: null,
      patient: null,
      barcode: null,
      hasLabTable: false,
      parameterCount: parameters.length,
      detectedParameters: parameters,
      reason: "Deterministic unrelated-document match.",
    };
  }

  return null;
}

export const documentValidationService = {
  /**
   * Returns a structured document-class verdict. External AI is the fallback,
   * not the first step, for text-rich PDFs.
   */
  async validate(buffer: Buffer, mimeType: string): Promise<DocumentValidationResult> {
    if (mimeType === PDF_MIME) {
      const text = await extractPdfText(buffer).catch(() => "");
      if (meaningfulCharCount(text) >= env.BLOOD_TEST_TEXT_MIN_CHARS) {
        const localVerdict = deterministicVerdict(text);
        if (localVerdict) {
          logger.info(
            {
              classification: localVerdict.classification,
              parameterCount: localVerdict.parameterCount,
              validationMode: "deterministic",
            },
            "Blood test document classified without external AI",
          );
          return localVerdict;
        }

        const adapter = getAIAdapter();
        const result = await adapter.validateBloodTestDocument(text, mimeType);
        const deterministic = countKnownParameters(text);
        if (deterministic.length > result.parameterCount) {
          result.parameterCount = deterministic.length;
          const merged = new Set([...result.detectedParameters, ...deterministic]);
          result.detectedParameters = Array.from(merged);
        }
        return result;
      }

      // Sparse/absent text layer (scanned/exported image PDF) still needs a
      // vision-capable classifier. This is intentionally the expensive fallback.
      logger.info("Validation: sparse PDF text layer; using vision classification");
      return getAIAdapter().validateBloodTestDocument(buffer, mimeType);
    }

    if (mimeType.startsWith("image/")) {
      return getAIAdapter().validateBloodTestDocument(buffer, mimeType);
    }

    // Unsupported/unknown types should normally be blocked by the upload layer.
    // If one reaches this service, keep the validation gate fail-closed through
    // the provider rather than assuming it is a medical document.
    return getAIAdapter().validateBloodTestDocument(buffer, mimeType);
  },

  /** Returns true only when every hard gate criterion is satisfied. */
  isAcceptable(result: DocumentValidationResult): boolean {
    return (
      result.classification === "VALID" &&
      result.confidence >= env.BLOOD_TEST_VALIDATION_MIN_CONFIDENCE &&
      result.hasLabTable === true &&
      result.parameterCount >= env.BLOOD_TEST_VALIDATION_MIN_PARAMETERS
    );
  },

  /**
   * Validates and throws a stable 422 response on rejection. Logs intentionally
   * exclude patient identity, report text and raw health values.
   */
  async assertValidBloodTestReport(
    buffer: Buffer,
    mimeType: string,
  ): Promise<DocumentValidationResult> {
    const result = await this.validate(buffer, mimeType);

    if (!this.isAcceptable(result)) {
      logger.warn(
        {
          classification: result.classification,
          confidence: result.confidence,
          hasLabTable: result.hasLabTable,
          parameterCount: result.parameterCount,
          reason: result.reason,
        },
        "Blood test document rejected by validation gate",
      );
      throw new ApiError(422, BLOOD_TEST_VALIDATION_REJECTION_MESSAGE, {
        code: "BLOOD_TEST_VALIDATION_FAILED",
        details: {
          classification: result.classification,
          confidence: result.confidence,
          parameterCount: result.parameterCount,
          reason: result.reason,
        },
      });
    }

    logger.info(
      {
        classification: result.classification,
        confidence: result.confidence,
        hasLabTable: result.hasLabTable,
        parameterCount: result.parameterCount,
      },
      "Blood test document passed validation gate",
    );
    return result;
  },
};
