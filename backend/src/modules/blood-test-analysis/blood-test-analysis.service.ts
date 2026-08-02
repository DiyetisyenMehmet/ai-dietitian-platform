import type { BloodTestAnalysis } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { getStorageProvider } from "../../lib/storage";
import { ApiError } from "../../utils/api-error";
import { bloodTestRepository } from "../blood-test/blood-test.repository";
import { getAIAdapter } from "./ai-adapter/ai-adapter.factory";
import { bloodTestAnalysisRepository } from "./blood-test-analysis.repository";
import { extractionService } from "./extraction/extraction.service";
import { matchBiomarkerCode } from "./normalization/biomarker-aliases.map";
import { normalizationService } from "./normalization/normalization.service";
import { referenceRangesService } from "./reference-ranges/reference-ranges.service";
import { nutritionAdaptationService } from "../ai-coach/nutrition-adaptation.service";
import type { AnalysisContext, NormalizedBloodTestValue } from "./types";

/** Storage namespace used by the Sprint 11 uploader (kept in sync). */
function storageNamespace(userId: string): string {
  return `blood-tests/${userId}`;
}

/** Derives an age in whole years from a date of birth. */
function ageFromDob(dob: Date): number {
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Builds a non-sensitive analysis context from the user's onboarding profile.
 * Gender values outside MALE/FEMALE map to `ALL` so a neutral reference range
 * is selected.
 */
async function buildContext(userId: string): Promise<AnalysisContext> {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) {
    return { gender: "ALL", healthConditions: [], allergies: [] };
  }
  const gender = profile.gender === "MALE" || profile.gender === "FEMALE" ? profile.gender : "ALL";
  return {
    age: ageFromDob(profile.dateOfBirth),
    gender,
    country: null,
    dietaryPreference: profile.dietaryPreference,
    healthConditions: profile.healthConditions,
    allergies: profile.allergies,
  };
}

/**
 * Orchestrates Diewish's AI Blood Test Analysis Engine: load → extract →
 * normalize → compare → explain (AI) → persist. The whole run is synchronous
 * (no job queue exists in this codebase) and returns the persisted record.
 */
export const bloodTestAnalysisService = {
  /**
   * Runs the full analysis pipeline for an already-uploaded blood test.
   *
   * @param userId - Authenticated owner id.
   * @param bloodTestId - The uploaded blood test to analyze.
   * @returns The persisted analysis record (COMPLETED or FAILED).
   * @throws {ApiError} 404 when the upload is not found/owned by the user.
   */
  async analyze(userId: string, bloodTestId: string): Promise<BloodTestAnalysis> {
    const upload = await bloodTestRepository.findByIdForUser(bloodTestId, userId);
    if (!upload) {
      throw ApiError.notFound("Blood test upload not found.");
    }

    const analysis = await bloodTestAnalysisRepository.startProcessing(bloodTestId, userId);
    await prisma.bloodTestUpload
      .update({ where: { id: bloodTestId }, data: { status: "ANALYZING" } })
      .catch(() => undefined);

    const startedAt = Date.now();
    try {
      // 1. Load the stored document bytes.
      const buffer = await getStorageProvider().getBuffer({
        namespace: storageNamespace(userId),
        key: upload.storageKey,
      });

      // 2. Hybrid extraction (text → OCR → vision).
      const extraction = await extractionService.extract(buffer, upload.mimeType);

      // 3. Resolve reference ranges for the recognized biomarkers.
      const context = await buildContext(userId);
      const codes = Array.from(
        new Set(
          extraction.values
            .map((value) => matchBiomarkerCode(value.name))
            .filter((code): code is string => code !== null),
        ),
      );
      const rangeMap = await referenceRangesService.getRangeMapForCodes(codes, context);

      // 4. Normalize + compare against ranges.
      const normalized = normalizationService.normalize(extraction.values, rangeMap);
      const abnormal: NormalizedBloodTestValue[] = normalized.filter(
        (value) => value.status !== "NORMAL" && value.status !== "UNKNOWN",
      );

      // 5. AI explanations + nutrition implications.
      const adapter = getAIAdapter();
      const aiResult = await adapter.analyzeBloodTestValues(normalized, context);

      // 6. Persist the completed analysis.
      return await bloodTestAnalysisRepository.complete(analysis.id, {
        status: "COMPLETED",
        extractionMethod: extraction.method,
        rawExtractedText: extraction.rawText,
        normalizedValues: normalized,
        abnormalValues: abnormal,
        abnormalCount: abnormal.length,
        aiExplanations: aiResult.explanations,
        nutritionImplications: aiResult.nutritionImplications,
        overallRecommendations: aiResult.overallRecommendations,
        summary: aiResult.summary,
        aiProvider: adapter.info.provider,
        aiModel: adapter.info.model,
        processingTimeMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed.";
      logger.error({ err: error, bloodTestId, userId }, "Blood test analysis failed");
      await prisma.bloodTestUpload
        .update({ where: { id: bloodTestId }, data: { status: "FAILED" } })
        .catch(() => undefined);
      await bloodTestAnalysisRepository
        .complete(analysis.id, {
          status: "FAILED",
          processingTimeMs: Date.now() - startedAt,
          errorMessage: message,
        })
        .catch(() => undefined);
      // Re-throw operational errors so the client sees the right status code.
      if (error instanceof ApiError) throw error;
      throw ApiError.internal("Blood test analysis failed.");
    } finally {
      // Mark the upload analyzed only when a completed record exists.
      const finalRecord = await bloodTestAnalysisRepository.findByIdForUser(analysis.id, userId);
      if (finalRecord?.status === "COMPLETED") {
        await prisma.bloodTestUpload
          .update({ where: { id: bloodTestId }, data: { status: "ANALYZED" } })
          .catch(() => undefined);
        // Sprint 19, Section 4: a fresh blood-test result may warrant a nutrition
        // adaptation. Best-effort, non-blocking — it must never fail the analysis.
        void nutritionAdaptationService.analyzeAndAdapt(userId).catch((err: unknown) => {
          logger.warn({ err, userId }, "Nutrition adaptation after blood test failed");
        });
      }
    }
  },

  /**
   * Returns the analysis for a given upload, or 404 if none exists / not owned.
   *
   * @param userId - Authenticated owner id.
   * @param bloodTestId - The uploaded blood test id.
   */
  async getByBloodTestId(userId: string, bloodTestId: string): Promise<BloodTestAnalysis> {
    const analysis = await bloodTestAnalysisRepository.findByBloodTestIdForUser(
      bloodTestId,
      userId,
    );
    if (!analysis) {
      throw ApiError.notFound("No analysis found for this blood test.");
    }
    return analysis;
  },

  /**
   * Lists all analyses belonging to the authenticated user (newest first).
   *
   * @param userId - Authenticated owner id.
   */
  list(userId: string): Promise<BloodTestAnalysis[]> {
    return bloodTestAnalysisRepository.listByUser(userId);
  },
};
