import { apiRequest } from "@/infrastructure/api/http-client";
import { BLOOD_TEST_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/** Lifecycle status of an AI blood-test analysis run (backend enum). */
export type BloodTestAnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type BloodTestFreshness = "CURRENT" | "STALE" | "ARCHIVED";

export type BloodTestValueStatus =
  | "NORMAL"
  | "LOW"
  | "HIGH"
  | "CRITICALLY_LOW"
  | "CRITICALLY_HIGH"
  | "UNKNOWN";

export type ComparisonDirection = "increased" | "decreased" | "unchanged";
export type ComparisonReferenceStatus = BloodTestValueStatus;

export interface BiomarkerComparison {
  biomarkerCode: string;
  biomarkerName: string;
  unit: string;
  previousValue: number;
  currentValue: number;
  absoluteDifference: number;
  percentageDifference: number | null;
  direction: ComparisonDirection;
  previousReferenceStatus: ComparisonReferenceStatus;
  currentReferenceStatus: ComparisonReferenceStatus;
}

export interface LongitudinalComparison {
  previousAnalysisId: string;
  previousMeasuredAt: string | null;
  currentMeasuredAt: string | null;
  comparedCount: number;
  comparisons: BiomarkerComparison[];
}

export interface BloodTestReferenceRange {
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  optimalMin?: number | null;
  optimalMax?: number | null;
  source: string;
}

export interface BloodTestNormalizedValue {
  biomarkerCode: string;
  biomarkerName: string;
  rawValue: string;
  numericValue: number | null;
  unit: string;
  extractedUnit?: string | null;
  referenceRange: BloodTestReferenceRange | null;
  status: BloodTestValueStatus;
}

export interface BloodTestExplanation {
  biomarkerCode: string;
  biomarkerName: string;
  status: BloodTestValueStatus;
  explanation: string;
}

export interface BloodTestNutritionImplication {
  biomarkerCode: string;
  biomarkerName: string;
  implication: string;
  possibleNutritionFactors?: string[];
  suggestedFoods: string[];
  foodsToLimit: string[];
  mealIdeas?: string[];
}

export interface BloodTestUpload {
  id: string;
  status: "UPLOADED" | "ANALYZING" | "ANALYZED" | "FAILED";
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  testDate: string | null;
  createdAt: string;
}

/** Public analysis contract returned by the backend's owner-scoped endpoints. */
export interface BloodTestAnalysis {
  id: string;
  bloodTestId: string;
  status: BloodTestAnalysisStatus;
  summary: string | null;
  abnormalCount: number;
  normalizedValues?: BloodTestNormalizedValue[];
  aiExplanations?: BloodTestExplanation[];
  nutritionImplications?: BloodTestNutritionImplication[];
  overallRecommendations?: string[];
  errorMessage?: string | null;
  testDate?: string | null;
  freshness?: BloodTestFreshness | null;
  freshnessAgeDays?: number | null;
  personalizationEligible?: boolean;
  freshnessMessage?: string | null;
  /** Present only on the owner-scoped detail response, not the history list. */
  longitudinalComparison?: LongitudinalComparison | null;
  createdAt: string;
  updatedAt?: string;
}

function uploadForm(file: File, testDate: string): FormData {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("testDate", testDate);
  return form;
}

export const bloodTestClient = {
  /** Preferred browser flow: upload and analyze on the same backend request/instance. */
  uploadAndAnalyze(file: File, testDate: string) {
    return apiRequest<{ upload: BloodTestUpload; analysis: BloodTestAnalysis }>({
      path: "/blood-tests/analyze-upload",
      method: "POST",
      auth: true,
      body: uploadForm(file, testDate),
    });
  },

  /** Upload-only endpoint kept for lower-level workflows. */
  upload(file: File, testDate: string) {
    return apiRequest<{ upload: BloodTestUpload }>({
      path: "/blood-tests",
      method: "POST",
      auth: true,
      body: uploadForm(file, testDate),
    });
  },

  analyze(uploadId: string) {
    return apiRequest<{ analysis: BloodTestAnalysis }>({
      path: `/blood-tests/${encodeURIComponent(uploadId)}/analyze`,
      method: "POST",
      auth: true,
    });
  },

  getAnalysis(uploadId: string) {
    return apiRequest<{ analysis: BloodTestAnalysis }>({
      path: `/blood-tests/${encodeURIComponent(uploadId)}/analysis`,
      method: "GET",
      auth: true,
    });
  },

  listAnalyses() {
    return apiRequest<{ analyses: BloodTestAnalysis[] }>({
      path: BLOOD_TEST_ENDPOINTS.analyses,
      method: "GET",
      auth: true,
    });
  },

  removeUpload(uploadId: string) {
    return apiRequest<{ message: string }>({
      path: `/blood-tests/${encodeURIComponent(uploadId)}`,
      method: "DELETE",
      auth: true,
    });
  },
} as const;
