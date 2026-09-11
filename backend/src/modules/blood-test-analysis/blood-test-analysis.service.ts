import type { BloodTestAnalysis } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { getStorageProviderByName } from "../../lib/storage";
import { ApiError } from "../../utils/api-error";
import { bloodTestRepository } from "../blood-test/blood-test.repository";
import { getAIAdapter } from "./ai-adapter/ai-adapter.factory";
import { bloodTestAnalysisRepository } from "./blood-test-analysis.repository";
import {
  LAB_REPORT_KEYWORDS,
  LAB_UNIT_PATTERN,
  MIN_NUMERIC_VALUES,
  MIN_RECOGNIZED_BIOMARKERS,
  MIN_STRUCTURE_SCORE,
  MIN_VALUES_WITH_UNITS,
  NOT_A_BLOOD_TEST_MESSAGE,
  REFERENCE_RANGE_PATTERN,
} from "./constants";
import { extractionService } from "./extraction/extraction.service";
import { documentEnhancementService } from "./enhancement/document-enhancement.service";
import { documentQualityAssessmentService } from "./enhancement/document-quality-assessment.service";
import { documentValidationService } from "./validation/document-validation.service";
import { longitudinalComparisonService } from "./comparison/longitudinal-comparison.service";
import { matchBiomarkerCode } from "./normalization/biomarker-aliases.map";
import { normalizationService } from "./normalization/normalization.service";
import { referenceRangesService } from "./reference-ranges/reference-ranges.service";
import { nutritionAdaptationService } from "../ai-coach/nutrition-adaptation.service";
import { aiUsageService } from "../ai-usage/ai-usage.service";
import type {
  AnalysisContext,
  BiomarkerExplanation,
  ExtractionResult,
  NormalizedBloodTestValue,
  NutritionImplication,
} from "./types";

function assertLooksLikeBloodTest(
  extraction: ExtractionResult,
  recognizedCodes: string[],
): void {
  const values = extraction.values;
  const rawText = extraction.rawText ?? "";
  const lowerText = rawText.toLowerCase();

  const biomarkerCount = recognizedCodes.length;
  const valuesWithUnits = values.filter(
    (value) => typeof value.unit === "string" && LAB_UNIT_PATTERN.test(value.unit),
  ).length;
  const rawTextHasUnits = LAB_UNIT_PATTERN.test(rawText);

  const numericValueCount = values.filter((value) => /\d/.test(value.rawValue)).length;
  const hasReferenceRanges = REFERENCE_RANGE_PATTERN.test(rawText);
  const hasLabKeyword = LAB_REPORT_KEYWORDS.some((keyword) => lowerText.includes(keyword));

  let structureScore = 0;
  if (valuesWithUnits >= MIN_VALUES_WITH_UNITS) structureScore += 1;
  if (biomarkerCount >= MIN_RECOGNIZED_BIOMARKERS + 1) structureScore += 1;
  if (hasReferenceRanges) structureScore += 1;
  if (hasLabKeyword) structureScore += 1;
  if (numericValueCount >= MIN_NUMERIC_VALUES) structureScore += 1;

  const hasMultipleBiomarkers = biomarkerCount >= MIN_RECOGNIZED_BIOMARKERS;
  const hasUnits = valuesWithUnits >= MIN_VALUES_WITH_UNITS || rawTextHasUnits;
  const hasStructure = structureScore >= MIN_STRUCTURE_SCORE;

  if (!hasMultipleBiomarkers || !hasUnits || !hasStructure) {
    logger.warn(
      {
        biomarkerCount,
        valuesWithUnits,
        rawTextHasUnits,
        numericValueCount,
        hasReferenceRanges,
        hasLabKeyword,
        structureScore,
        checks: { hasMultipleBiomarkers, hasUnits, hasStructure },
      },
      "Upload rejected: not recognized as a laboratory blood-test report",
    );
    throw new ApiError(422, NOT_A_BLOOD_TEST_MESSAGE, { code: "NOT_A_BLOOD_TEST" });
  }
}

function storageNamespace(userId: string): string {
  return `blood-tests/${userId}`;
}

function ageFromDob(dob: Date): number {
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

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

function formattedResult(value: NormalizedBloodTestValue): string {
  const sourceUnit = value.extractedUnit?.trim() || value.unit;
  return `${value.rawValue}${sourceUnit ? ` ${sourceUnit}` : ""}`;
}

function formattedReference(value: NormalizedBloodTestValue): string | null {
  const range = value.referenceRange;
  if (!range) return null;
  const unit = range.unit ? ` ${range.unit}` : "";
  if (range.minValue !== null && range.maxValue !== null) {
    return `${range.minValue}–${range.maxValue}${unit}`;
  }
  if (range.minValue !== null) return `≥ ${range.minValue}${unit}`;
  if (range.maxValue !== null) return `≤ ${range.maxValue}${unit}`;
  return null;
}

function fallbackExplanation(value: NormalizedBloodTestValue): string {
  const result = formattedResult(value);
  const reference = formattedReference(value);
  const isLabReference = value.referenceRange?.source === "LAB_REPORT";

  if (!isLabReference) {
    if (reference) {
      return `${value.biomarkerName} sonucunuz ${result}. Raporda güvenilir bir laboratuvar referans aralığı okunamadığı için bu ölçüm normal, düşük veya yüksek olarak sınıflandırılmadı. ${reference} genel referansı yalnızca bilgi amaçlı gösterilebilir.`;
    }
    return `${value.biomarkerName} sonucunuz ${result}. Raporda güvenilir bir referans aralığı bulunamadığı için bu ölçüm normal, düşük veya yüksek olarak sınıflandırılmadı.`;
  }

  if (value.status === "UNKNOWN" || !reference) {
    return `${value.biomarkerName} sonucunuz ${result}. Rapordaki referans bilgisi güvenilir biçimde değerlendirilemediği için bu ölçüm sınıflandırılmadı.`;
  }

  if (value.status === "NORMAL") {
    return `${value.biomarkerName} sonucunuz ${result}; raporda yazan ${reference} referans aralığının içindedir. Bu sınıflandırma yalnızca bu ölçümün laboratuvar aralığındaki konumunu gösterir.`;
  }

  if (value.status === "LOW" || value.status === "CRITICALLY_LOW") {
    return `${value.biomarkerName} sonucunuz ${result}; raporda yazan ${reference} referans aralığının altındadır. Sonuç, ilgili diğer ölçümler ve kişisel sağlık bağlamıyla birlikte değerlendirilmelidir.`;
  }

  return `${value.biomarkerName} sonucunuz ${result}; raporda yazan ${reference} referans aralığının üzerindedir. Sonuç, ilgili diğer ölçümler ve kişisel sağlık bağlamıyla birlikte değerlendirilmelidir.`;
}

function reconcileExplanations(
  normalized: NormalizedBloodTestValue[],
  generated: BiomarkerExplanation[],
): BiomarkerExplanation[] {
  const authoritative = new Map<string, NormalizedBloodTestValue>();
  for (const value of normalized) {
    if (!authoritative.has(value.biomarkerCode)) {
      authoritative.set(value.biomarkerCode, value);
    }
  }

  const accepted = new Map<string, BiomarkerExplanation>();
  let rejectedCount = 0;
  for (const explanation of generated) {
    const value = authoritative.get(explanation.biomarkerCode);
    const text = explanation.explanation?.trim();
    if (!value || !text || accepted.has(value.biomarkerCode)) {
      rejectedCount += 1;
      continue;
    }
    accepted.set(value.biomarkerCode, {
      biomarkerCode: value.biomarkerCode,
      biomarkerName: value.biomarkerName,
      status: value.status,
      explanation: text,
    });
  }

  const reconciled = Array.from(authoritative.values()).map((value) => {
    return (
      accepted.get(value.biomarkerCode) ?? {
        biomarkerCode: value.biomarkerCode,
        biomarkerName: value.biomarkerName,
        status: value.status,
        explanation: fallbackExplanation(value),
      }
    );
  });

  const missingCount = reconciled.length - accepted.size;
  const duplicateNormalizedCount = normalized.length - authoritative.size;
  if (missingCount > 0 || rejectedCount > 0 || duplicateNormalizedCount > 0) {
    logger.warn(
      {
        normalizedCount: normalized.length,
        distinctBiomarkerCount: authoritative.size,
        providerExplanationCount: generated.length,
        acceptedProviderExplanationCount: accepted.size,
        deterministicFallbackCount: missingCount,
        rejectedProviderExplanationCount: rejectedCount,
        duplicateNormalizedCount,
      },
      "Blood-test AI explanations reconciled against normalized values",
    );
  }

  return reconciled;
}

function isReportClassifiedAbnormal(value: NormalizedBloodTestValue): boolean {
  if (value.referenceRange?.source !== "LAB_REPORT") return false;
  return (
    value.status === "LOW" ||
    value.status === "HIGH" ||
    value.status === "CRITICALLY_LOW" ||
    value.status === "CRITICALLY_HIGH"
  );
}

function reconcileNutritionImplications(
  normalized: NormalizedBloodTestValue[],
  generated: NutritionImplication[],
): NutritionImplication[] {
  const authoritative = new Map<string, NormalizedBloodTestValue>();
  for (const value of normalized) {
    if (isReportClassifiedAbnormal(value) && !authoritative.has(value.biomarkerCode)) {
      authoritative.set(value.biomarkerCode, value);
    }
  }

  const accepted = new Map<string, NutritionImplication>();
  let rejectedCount = 0;
  for (const implication of generated) {
    const value = authoritative.get(implication.biomarkerCode);
    if (!value || accepted.has(value.biomarkerCode)) {
      rejectedCount += 1;
      continue;
    }
    accepted.set(value.biomarkerCode, {
      ...implication,
      biomarkerCode: value.biomarkerCode,
      biomarkerName: value.biomarkerName,
    });
  }

  if (rejectedCount > 0) {
    logger.warn(
      {
        providerNutritionImplicationCount: generated.length,
        acceptedNutritionImplicationCount: accepted.size,
        rejectedNutritionImplicationCount: rejectedCount,
      },
      "Blood-test nutrition implications reconciled against report-classified values",
    );
  }

  return Array.from(accepted.values());
}

export const bloodTestAnalysisService = {
  async analyze(userId: string, bloodTestId: string): Promise<BloodTestAnalysis> {
    const upload = await bloodTestRepository.findByIdForUser(bloodTestId, userId);
    if (!upload) {
      throw ApiError.notFound("Blood test upload not found.");
    }

    await aiUsageService.assertWithinQuota(userId, "BLOOD_TEST_ANALYSIS");

    const analysis = await bloodTestAnalysisRepository.startProcessing(bloodTestId, userId);
    await prisma.bloodTestUpload
      .update({ where: { id: bloodTestId }, data: { status: "ANALYZING" } })
      .catch(() => undefined);

    const startedAt = Date.now();
    try {
      const storage = getStorageProviderByName(upload.storageProvider);
      const buffer = await storage.getBuffer({
        namespace: storageNamespace(userId),
        key: upload.storageKey,
      });

      // The enhancement service may create a smaller AI-facing derivative. In
      // the rare oversized-PNG fallback that derivative becomes JPEG, therefore
      // its returned MIME type — not the original upload MIME — must travel with
      // the derivative through every downstream stage.
      const enhanced = await documentEnhancementService.enhance(buffer, upload.mimeType);
      const documentBuffer = enhanced.buffer;
      const documentMimeType = enhanced.mimeType;

      const quality = await documentQualityAssessmentService.assess(
        documentBuffer,
        documentMimeType,
      );

      await documentValidationService.assertValidBloodTestReport(
        documentBuffer,
        documentMimeType,
      );

      const extraction = await extractionService.extract(documentBuffer, documentMimeType);

      const context = await buildContext(userId);
      const codes = Array.from(
        new Set(
          extraction.values
            .map((value) => matchBiomarkerCode(value.name))
            .filter((code): code is string => code !== null),
        ),
      );

      assertLooksLikeBloodTest(extraction, codes);

      const rangeMap = await referenceRangesService.getRangeMapForCodes(codes, context);
      const normalized = normalizationService.normalize(extraction.values, rangeMap);
      const abnormal: NormalizedBloodTestValue[] = normalized.filter((value) =>
        isReportClassifiedAbnormal(value),
      );

      const longitudinalComparison = await longitudinalComparisonService.buildForUser(
        userId,
        analysis.id,
        normalized,
      );
      if (longitudinalComparison) {
        logger.info(
          { comparedCount: longitudinalComparison.comparedCount },
          "Longitudinal blood-test comparison prepared",
        );
      }

      const adapter = getAIAdapter();
      const aiResult = await adapter.analyzeBloodTestValues(normalized, context);
      const explanations = reconcileExplanations(normalized, aiResult.explanations);
      const nutritionImplications = reconcileNutritionImplications(
        normalized,
        aiResult.nutritionImplications,
      );

      const overallRecommendations =
        quality.warning !== null
          ? [quality.warning, ...aiResult.overallRecommendations]
          : aiResult.overallRecommendations;

      const completed = await bloodTestAnalysisRepository.complete(analysis.id, {
        status: "COMPLETED",
        extractionMethod: extraction.method,
        rawExtractedText: extraction.rawText,
        normalizedValues: normalized,
        abnormalValues: abnormal,
        abnormalCount: abnormal.length,
        aiExplanations: explanations,
        nutritionImplications,
        overallRecommendations,
        summary: aiResult.summary,
        aiProvider: adapter.info.provider,
        aiModel: adapter.info.model,
        processingTimeMs: Date.now() - startedAt,
      });

      await aiUsageService.record({
        userId,
        feature: "BLOOD_TEST_ANALYSIS",
        provider: adapter.info.provider,
        model: adapter.info.model,
      });

      return completed;
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
      if (error instanceof ApiError) throw error;
      throw ApiError.internal("Blood test analysis failed.");
    } finally {
      const finalRecord = await bloodTestAnalysisRepository.findByIdForUser(analysis.id, userId);
      if (finalRecord?.status === "COMPLETED") {
        await prisma.bloodTestUpload
          .update({ where: { id: bloodTestId }, data: { status: "ANALYZED" } })
          .catch(() => undefined);
        void nutritionAdaptationService.analyzeAndAdapt(userId).catch((err: unknown) => {
          logger.warn({ err, userId }, "Nutrition adaptation after blood test failed");
        });
      }
    }
  },

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

  list(userId: string): Promise<BloodTestAnalysis[]> {
    return bloodTestAnalysisRepository.listByUser(userId);
  },
};