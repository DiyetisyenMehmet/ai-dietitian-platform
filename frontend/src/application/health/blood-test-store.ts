"use client";

import * as React from "react";

import { bloodTestClient, type BloodTestAnalysis } from "@/infrastructure/tracking/blood-test-client";

/** UI/cache representation of a persisted blood-test analysis. */
export type BloodTestUiStatus = "analyzing" | "analyzed" | "failed";

export interface BloodTestSummaryView {
  /** Analysis id for persisted rows; temporary client id while uploading. */
  id: string;
  /** Backend upload id used for deletion and ownership-safe server actions. */
  uploadId?: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  title: string;
  summary: string;
  flaggedCount: number;
  status: BloodTestUiStatus;
  fileName?: string;
}

let uid = 0;
const nextId = () => `bt-local-${Date.now()}-${uid++}`;

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

/** Converts a persisted backend analysis record into a cache summary. */
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

  return {
    id: analysis.id,
    uploadId: analysis.bloodTestId,
    date: analysis.createdAt.slice(0, 10),
    title: options?.title ?? options?.fileName?.replace(/\.[^.]+$/, "") ?? "Kan Tahlili Analizi",
    summary:
      status === "failed"
        ? failureSummary(analysis.errorMessage)
        : analysis.summary ?? (status === "analyzed" ? "Analiz tamamlandı." : "Analiz ediliyor…"),
    flaggedCount: analysis.abnormalCount ?? 0,
    status,
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
  /** Hydrates the server-owned analysis history. FAILED is never shown as endless PROCESSING. */
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
   * Real upload -> validation/extraction/AI-analysis pipeline.
   * A temporary card is shown only while the request is in flight. On any
   * failure we re-hydrate the authoritative server state so a FAILED analysis
   * is surfaced instead of leaving an immortal "Analiz ediliyor" placeholder.
   */
  async uploadAndAnalyze(file: File): Promise<BloodTestSummaryView> {
    const temporaryId = nextId();
    const temporary: BloodTestSummaryView = {
      id: temporaryId,
      date: today(),
      title: file.name.replace(/\.[^.]+$/, "") || "Kan Tahlili",
      summary: "Dosya yükleniyor ve doğrulanıyor…",
      flaggedCount: 0,
      status: "analyzing",
      fileName: file.name,
    };
    tests = [temporary, ...tests];
    emit();

    try {
      const { upload } = await bloodTestClient.upload(file);
      replaceById(temporaryId, {
        ...temporary,
        uploadId: upload.id,
        summary: "Kan tahlili doğrulanıyor ve analiz ediliyor…",
      });

      const { analysis } = await bloodTestClient.analyze(upload.id);
      const completed = toSummary(analysis, { fileName: file.name, title: temporary.title });
      replaceById(temporaryId, completed);
      return completed;
    } catch (error) {
      // The backend may have persisted a FAILED analysis before returning the
      // operational error. Re-read it so the UI reflects the real terminal state.
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

  /** Deletes the real server upload and only then removes its cached analysis. */
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

/** Subscribe to the blood-test history (newest -> oldest). */
export function useBloodTests(): BloodTestSummaryView[] {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(() => sorted(raw), [raw]);
}
