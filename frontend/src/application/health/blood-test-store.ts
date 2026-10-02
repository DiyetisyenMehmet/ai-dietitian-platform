"use client";

import * as React from "react";

import {
  bloodTestClient,
  type BloodTestAnalysis,
  type BloodTestExplanation,
  type BloodTestNormalizedValue,
  type BloodTestNutritionImplication,
  type BloodTestFreshness,
  type LongitudinalComparison,
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
  freshness: BloodTestFreshness | null;
  freshnessAgeDays: number | null;
  freshnessMessage: string | null;
  personalizationEligible: boolean;
  fileName?: string;
}

let uid = 0;
const nextId = () => `bt-local-${Date.now()}-${uid++}`;

const LEGACY_BLOOD_DISCLAIMER_START =
  "Diewish provides educational and nutrition-focused information only.";

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
    date: analysis.testDate ?? analysis.createdAt.slice(0, 10),
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
    freshness: analysis.freshness ?? null,
    freshnessAgeDays: analysis.freshnessAgeDays ?? null,
    freshnessMessage: analysis.freshnessMessage ?? null,
    personalizationEligible: analysis.personalizationEligible ?? false,
    ...(options?.fileName ? { fileName: options.fileName } : {}),
  };
}

let tests: BloodTestSummaryView[] = [];
const listeners = new Set<() => void>();

export type BloodTestComparisonLoadStatus = "idle" | "loading" | "success" | "error";

export interface BloodTestComparisonState {
  status: BloodTestComparisonLoadStatus;
  comparison: LongitudinalComparison | null;
}

const IDLE_COMPARISON_STATE: BloodTestComparisonState = {
  status: "idle",
  comparison: null,
};

let comparisonStates: Readonly<Record<string, BloodTestComparisonState>> = {};
const comparisonListeners = new Set<() => void>();
const comparisonRequests = new Map<string, Promise<LongitudinalComparison | null>>();

function emitComparison() {
  comparisonListeners.forEach((listener) => listener());
}

function subscribeComparison(listener: () => void) {
  comparisonListeners.add(listener);
  return () => comparisonListeners.delete(listener);
}

function getComparisonSnapshot() {
  return comparisonStates;
}

function setComparisonState(uploadId: string, state: BloodTestComparisonState) {
  comparisonStates = { ...comparisonStates, [uploadId]: state };
  emitComparison();
}

function clearComparisonState(uploadId: string) {
  if (!(uploadId in comparisonStates)) return;
  const next = { ...comparisonStates };
  delete next[uploadId];
  comparisonStates = next;
  emitComparison();
}

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
  async loadComparison(
    uploadId: string,
    options?: { force?: boolean },
  ): Promise<LongitudinalComparison | null> {
    const inFlight = comparisonRequests.get(uploadId);
    if (inFlight) return inFlight;

    const existing = comparisonStates[uploadId];
    if (!options?.force && existing?.status === "success") {
      return existing.comparison;
    }

    setComparisonState(uploadId, { status: "loading", comparison: null });

    const request = bloodTestClient
      .getAnalysis(uploadId)
      .then(({ analysis }) => {
        const comparison = analysis.longitudinalComparison ?? null;
        setComparisonState(uploadId, { status: "success", comparison });
        return comparison;
      })
      .catch((error: unknown) => {
        setComparisonState(uploadId, { status: "error", comparison: null });
        throw error;
      })
      .finally(() => {
        comparisonRequests.delete(uploadId);
      });

    comparisonRequests.set(uploadId, request);
    return request;
  },

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
  async uploadAndAnalyze(file: File, testDate: string): Promise<BloodTestSummaryView> {
    const temporaryId = nextId();
    const temporary: BloodTestSummaryView = {
      id: temporaryId,
      date: testDate,
      title: file.name.replace(/\.[^.]+$/, "") || "Kan Tahlili",
      summary: "Dosya doğrulanıyor ve analiz ediliyor…",
      flaggedCount: 0,
      unknownCount: 0,
      status: "analyzing",
      normalizedValues: [],
      explanations: [],
      nutritionImplications: [],
      recommendations: [],
      freshness: null,
      freshnessAgeDays: null,
      freshnessMessage: null,
      personalizationEligible: false,
      fileName: file.name,
    };
    tests = [temporary, ...tests];
    emit();

    try {
      const { upload, analysis } = await bloodTestClient.uploadAndAnalyze(file, testDate);
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
    clearComparisonState(test.uploadId);
    emit();
  },

  reset() {
    tests = [];
    comparisonStates = {};
    comparisonRequests.clear();
    emit();
    emitComparison();
  },
};

export function useBloodTests(): BloodTestSummaryView[] {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(() => sorted(raw), [raw]);
}

export function useBloodTestComparison(uploadId?: string): BloodTestComparisonState {
  const states = React.useSyncExternalStore(
    subscribeComparison,
    getComparisonSnapshot,
    getComparisonSnapshot,
  );
  return uploadId ? states[uploadId] ?? IDLE_COMPARISON_STATE : IDLE_COMPARISON_STATE;
}
