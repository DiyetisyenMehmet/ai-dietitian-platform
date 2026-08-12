/**
 * Blood Test Validation Pipeline (Sprint 25 — critical release blocker).
 *
 * This service is the gate that runs BEFORE any OCR extraction or AI medical
 * analysis. It classifies an uploaded document and either returns a passing
 * verdict or throws with the exact user-facing Turkish rejection message. If a
 * document does not pass, the medical analysis engine MUST never start.
 *
 * Design:
 *  - Images   → single vision classification call.
 *  - PDFs     → try the embedded text layer first (cheap + deterministic
 *               biomarker backstop). If the text layer is too sparse to judge,
 *               fall back to a vision classification of the raw PDF.
 *  - Hard gate → classification === VALID AND confidence >= threshold AND a lab
 *               table was detected AND parameterCount >= minimum. Any miss is a
 *               rejection.
 *
 * Only the FIRST page's worth of a multi-page report is needed to validate; the
 * text layer / vision call naturally operate on the whole document, and a
 * genuine report satisfies the gate from its first page.
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

/**
 * Deterministically counts recognizable laboratory parameters in recovered
 * text. Used as a backstop over the PDF text path so a document with a real
 * table of biomarkers is never rejected purely due to a weak model reply, and
 * — conversely — a non-lab PDF with no biomarkers cannot be waved through.
 */
function countKnownParameters(text: string): string[] {
  const haystack = text.toLowerCase();
  const found = new Set<string>();
  for (const param of KNOWN_BLOOD_TEST_PARAMETERS) {
    if (haystack.includes(param)) found.add(param);
  }
  return Array.from(found);
}

export const documentValidationService = {
  /**
   * Runs the 7-step classification and returns the structured verdict WITHOUT
   * applying the gate. Callers that need the pass/fail decision should use
   * {@link assertValidBloodTestReport} instead.
   *
   * @param buffer - Raw document bytes loaded from storage.
   * @param mimeType - Detected MIME type of the document.
   */
  async validate(buffer: Buffer, mimeType: string): Promise<DocumentValidationResult> {
    const adapter = getAIAdapter();

    if (mimeType === PDF_MIME) {
      // Prefer the embedded text layer: cheap, and lets a deterministic
      // biomarker count reinforce the model verdict.
      const text = await extractPdfText(buffer).catch(() => "");
      if (meaningfulCharCount(text) >= env.BLOOD_TEST_TEXT_MIN_CHARS) {
        const result = await adapter.validateBloodTestDocument(text, mimeType);
        const deterministic = countKnownParameters(text);
        // Never let the recognized-parameter count fall below what we can prove
        // deterministically from the text.
        if (deterministic.length > result.parameterCount) {
          result.parameterCount = deterministic.length;
          const merged = new Set([...result.detectedParameters, ...deterministic]);
          result.detectedParameters = Array.from(merged);
        }
        return result;
      }
      // Sparse/absent text layer (scanned/exported image PDF) → vision.
      logger.info("Validation: sparse PDF text layer → vision classification");
      return adapter.validateBloodTestDocument(buffer, mimeType);
    }

    if (mimeType.startsWith("image/")) {
      return adapter.validateBloodTestDocument(buffer, mimeType);
    }

    // Unknown type: attempt vision as a best effort; the gate will reject if it
    // is not a lab report.
    return adapter.validateBloodTestDocument(buffer, mimeType);
  },

  /**
   * Applies the hard gate to a validation result.
   *
   * @returns true only when the document is a genuine lab blood-test report by
   *          every gate criterion.
   */
  isAcceptable(result: DocumentValidationResult): boolean {
    return (
      result.classification === "VALID" &&
      result.confidence >= env.BLOOD_TEST_VALIDATION_MIN_CONFIDENCE &&
      result.hasLabTable === true &&
      result.parameterCount >= env.BLOOD_TEST_VALIDATION_MIN_PARAMETERS
    );
  },

  /**
   * Validates a document and THROWS the exact Turkish rejection message when it
   * does not pass the gate. On success, returns the verdict so the caller can
   * log the recognized hospital/patient/parameters.
   *
   * @throws {ApiError} 422 with the pinned Turkish message on rejection.
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
          hospital: result.hospital,
          reportDate: result.reportDate,
          patient: result.patient,
          parameterCount: result.parameterCount,
          detectedParameters: result.detectedParameters,
          reason: result.reason,
        },
        "Blood test document rejected by validation gate",
      );
      throw new ApiError(422, BLOOD_TEST_VALIDATION_REJECTION_MESSAGE, {
        code: "BLOOD_TEST_VALIDATION_FAILED",
        details: {
          classification: result.classification,
          confidence: result.confidence,
          hospital: result.hospital,
          patient: result.patient,
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
        hospital: result.hospital,
        reportDate: result.reportDate,
        patient: result.patient,
        parameterCount: result.parameterCount,
        detectedParameters: result.detectedParameters,
        reason: result.reason,
      },
      "Blood test document passed validation gate",
    );
    return result;
  },
};
