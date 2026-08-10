import type { BloodTestAnalysis, BloodTestAnalysisStatus, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type {
  BiomarkerExplanation,
  ExtractionMethod,
  NormalizedBloodTestValue,
  NutritionImplication,
} from "./types";

/** Casts a typed value to a Prisma JSON input value. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** Fields written when an analysis run completes (or fails). */
export interface AnalysisCompletionData {
  status: BloodTestAnalysisStatus;
  extractionMethod?: ExtractionMethod | null;
  rawExtractedText?: string | null;
  normalizedValues?: NormalizedBloodTestValue[];
  abnormalValues?: NormalizedBloodTestValue[];
  abnormalCount?: number;
  aiExplanations?: BiomarkerExplanation[];
  nutritionImplications?: NutritionImplication[];
  overallRecommendations?: string[];
  summary?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  processingTimeMs?: number | null;
  errorMessage?: string | null;
}

/**
 * Data-access layer for AI blood-test analyses. All reads are owner-scoped by
 * `userId` so a user can never access another user's analysis.
 */
export const bloodTestAnalysisRepository = {
  /**
   * Creates (or resets, if one already exists) an analysis in the PROCESSING
   * state for the given upload. The one-to-one `bloodTestId` uniqueness makes
   * this idempotent for re-analysis.
   */
  startProcessing(bloodTestId: string, userId: string): Promise<BloodTestAnalysis> {
    return prisma.bloodTestAnalysis.upsert({
      where: { bloodTestId },
      create: {
        bloodTestId,
        userId,
        status: "PROCESSING",
        normalizedValues: toJson([]),
        abnormalValues: toJson([]),
        aiExplanations: toJson([]),
        nutritionImplications: toJson([]),
        overallRecommendations: toJson([]),
      },
      update: {
        status: "PROCESSING",
        errorMessage: null,
      },
    });
  },

  /** Applies the terminal (COMPLETED/FAILED) state of an analysis run. */
  complete(id: string, data: AnalysisCompletionData): Promise<BloodTestAnalysis> {
    return prisma.bloodTestAnalysis.update({
      where: { id },
      data: {
        status: data.status,
        extractionMethod: data.extractionMethod ?? null,
        rawExtractedText: data.rawExtractedText ?? null,
        ...(data.normalizedValues ? { normalizedValues: toJson(data.normalizedValues) } : {}),
        ...(data.abnormalValues ? { abnormalValues: toJson(data.abnormalValues) } : {}),
        ...(data.abnormalCount === undefined ? {} : { abnormalCount: data.abnormalCount }),
        ...(data.aiExplanations ? { aiExplanations: toJson(data.aiExplanations) } : {}),
        ...(data.nutritionImplications
          ? { nutritionImplications: toJson(data.nutritionImplications) }
          : {}),
        ...(data.overallRecommendations
          ? { overallRecommendations: toJson(data.overallRecommendations) }
          : {}),
        summary: data.summary ?? null,
        aiProvider: data.aiProvider ?? null,
        aiModel: data.aiModel ?? null,
        processingTimeMs: data.processingTimeMs ?? null,
        errorMessage: data.errorMessage ?? null,
      },
    });
  },

  /** Fetches an analysis by its owning upload id, scoped to the user. */
  findByBloodTestIdForUser(bloodTestId: string, userId: string): Promise<BloodTestAnalysis | null> {
    return prisma.bloodTestAnalysis.findFirst({ where: { bloodTestId, userId } });
  },

  /** Fetches an analysis by id, scoped to the user. */
  findByIdForUser(id: string, userId: string): Promise<BloodTestAnalysis | null> {
    return prisma.bloodTestAnalysis.findFirst({ where: { id, userId } });
  },

  /** Lists a user's analyses, newest first. */
  listByUser(userId: string): Promise<BloodTestAnalysis[]> {
    return prisma.bloodTestAnalysis.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },
};
