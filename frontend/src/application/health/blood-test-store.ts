"use client";

import * as React from "react";

import {
  bloodTestClient,
  type BloodTestAnalysis,
  type BloodTestExplanation,
  type BloodTestNormalizedValue,
  type BloodTestNutritionImplication,
} from "@/infrastructure/tracking/blood-test-client";

export type BloodTestUiStatus = "analyzing" | "analyzed" | "failed";

export interface BloodTestSummaryView {
  id: string;
  uploadId?: string;
  date: string;
  title: string;
  summary: string;
  flaggedCount: number;
  unknownCount: number;
  status: BloodTestUiStatus;
  normalizedValues: BloodTestNormalizedValue[];
  explanations: BloodTestExplanation[];
  nutritionImplications: BloodTestNutritionImplication[];
  recommendations: string[];
  fileName?: string;
}

let uid = 0;
const nextId = () => `bt-local-${Date.now()}-${uid++}`;

const LEGACY_BLOOD_DISCLAIMER_START =
  "Diewish provides educational and nutrition-focused information only.";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function failureSummary(message?: string | null): string {
  const value = message?.trim();
  if (!value || value === "Analysis failed." || value === "Blood test analysis failed.") {
    return "Analiz tamamlanamadı. Dosyanın gerçek ve okunabilir bir laboratuvar kan tahlili olduğundan emin olup tekrar deneyin.";
  }
  return value;
}

/**
 * Older persisted analyses embedded the long English legal boilerplate directly
 * in `summary`. New analyses no longer do that, but stripping the exact legacy
 * suffix here keeps history readable without mutating stored health records.
 */
function displaySummary(summary?: string | null): string {
  const value = summary?.trim() ?? "";
  const disclaimerIndex = value.indexOf(LEGACY_BLOOD_DISCLAIMER_START);
  return (disclaimerIndex >= 0 ? value.slice(0, disclaimerIndex) : value).trim();
}

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function toSummary(
  analysis: BloodTestAnalysis,
  options?: { fileName?: string; title?: string },
): BloodTestSummaryView {
  const status: BloodTestUiStatus =
    analysis.status === "COMPLETED"
      ? "analyzed"
      : analysis.status === "FAILED"
        ? "failed"
        : "analyzing";

  const normalizedValues = asArray(analysis.normalizedValues);
  const explanations = asArray(analysis.aiExplanations);
  const nutritionImplications = asArray(analysis.nutritionImplications);
  const recommendations = asArray(analysis.overallRecommendations).map(String);
  const unknownCount = normalizedValues.filter((value) => value.status === "UNKNOWN").length;
  const cleanSummary = displaySummary(analysis.summary);

  return {
    id: analysis.id,
    uploadId: analysis.bloodTestId,
    date: analysis.createdAt.slice(0, 10),
    title: options?.title ?? options?.fileName?.replace(/\.[^.]+$/, "") ?? "Kan Tahlili Analizi",
    summary:
      status === "failed"
        ? failureSummary(analysis.errorMessage)
        : cleanSummary || (status === "analyzed" ? "Analiz tamamlandı." : "Analiz ediliyor…"),
    flaggedCount: analysis.abnormalCount ?? 0,
    unknownCount,
    status,
    normalizedValues,
    explanations,
    nutritionImplications,
    recommendations,
    ...(options?.fileName ? { fileName: options.fileName } : {}),
  };
}

let tests: BloodTestSummaryView[] = [];
const listeners = new Set<() => void>();

function emit() {
  tests = [...tests];
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return tests;
}

function sorted(list: BloodTestSummaryView[]): BloodTestSummaryView[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date));
}

function replaceById(id: string, replacement: BloodTestSummaryView) {
  tests = tests.map((test) => (test.id === id ? replacement : test));
  emit();
}

export const bloodTestStore = {
  async hydrateBloodTestsFromBackend(): Promise<void> {
    try {
      const { analyses } = await bloodTestClient.listAnalyses();
      tests = analyses.map((analysis) => toSummary(analysis));
      emit();
    } catch {
      tests = [];
      emit();
    }
  },

  /**
   * Uploads and analyzes in one server request so Cloud Run's ephemeral local
   * filesystem cannot split the upload and analysis across different instances.
   */
  async uploadAndAnalyze(file: File): Promise<BloodTestSummaryView> {
    const temporaryId = nextId();
    const temporary: BloodTestSummaryView = {
      id: temporaryId,
      date: today(),
      title: file.name.replace(/\.[^.]+$/, "") || "Kan Tahlili",
      summary: "Dosya doğrulanıyor ve analiz ediliyor…",
      flaggedCount: 0,
      unknownCount: 0,
      status: "analyzing",
      normalizedValues: [],
      explanations: [],
      nutritionImplications: [],
      recommendations: [],
      fileName: file.name,
    };
    tests = [temporary, ...tests];
    emit();

    try {
      const { upload, analysis } = await bloodTestClient.uploadAndAnalyze(file);
      const completed = toSummary(analysis, { fileName: file.name, title: temporary.title });
      completed.uploadId = upload.id;
      replaceById(temporaryId, completed);
      return completed;
    } catch (error) {
      // The backend may have persisted a terminal FAILED analysis before
      // returning an operational error. Re-read the authoritative state so the
      // UI never remains stuck on a fake PROCESSING card.
      try {
        const { analyses } = await bloodTestClient.listAnalyses();
        tests = analyses.map((analysis) => toSummary(analysis));
        emit();
      } catch {
        tests = tests.filter((test) => test.id !== temporaryId);
        emit();
      }
      throw error;
    }
  },

  async remove(test: BloodTestSummaryView): Promise<void> {
    if (!test.uploadId) {
      tests = tests.filter((item) => item.id !== test.id);
      emit();
      return;
    }
    await bloodTestClient.removeUpload(test.uploadId);
    tests = tests.filter((item) => item.id !== test.id);
    emit();
  },

  reset() {
    tests = [];
    emit();
  },
};

export function useBloodTests(): BloodTestSummaryView[] {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(() => sorted(raw), [raw]);
}
