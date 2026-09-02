"use client";

import * as React from "react";

import type { BloodTestSummary } from "@/domain/health/types";
import {
  bloodTestClient,
  type BloodTestAnalysis,
} from "@/infrastructure/tracking/blood-test-client";

/**
 * Blood-test cache. The backend is the single source of truth for analysis
 * history. No seeded/demo test or generated result is stored here.
 */

let uid = 0;
const nextId = () => `bt-${Date.now()}-${uid++}`;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Converts a persisted backend analysis record into a cache summary. */
function toSummary(a: BloodTestAnalysis): BloodTestSummary {
  const analyzed = a.status === "COMPLETED";
  return {
    id: a.id,
    date: a.createdAt.slice(0, 10),
    title: "Kan Tahlili Analizi",
    summary: a.summary ?? (analyzed ? "" : "Analiz ediliyor…"),
    flaggedCount: a.abnormalCount,
    status: analyzed ? "analyzed" : "analyzing",
  };
}

let tests: BloodTestSummary[] = [];
const listeners = new Set<() => void>();

function emit() {
  tests = [...tests];
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return tests;
}

/** Blood tests sorted newest → oldest. */
function sorted(list: BloodTestSummary[]): BloodTestSummary[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date));
}

export const bloodTestStore = {
  /**
   * Hydrates analysis history from the backend. On failure the cache is cleared
   * so sensitive results from another account/session are never retained.
   */
  async hydrateBloodTestsFromBackend(): Promise<void> {
    try {
      const { analyses } = await bloodTestClient.listAnalyses();
      tests = analyses.map(toSummary);
      emit();
    } catch {
      tests = [];
      emit();
    }
  },
  /**
   * Adds a temporary local row while an upload/analysis request is in flight.
   * The authoritative result must still come from backend hydration.
   */
  upload(fileName: string): string {
    const id = nextId();
    tests = [
      ...tests,
      {
        id,
        date: today(),
        title: fileName.replace(/\.[^.]+$/, "") || "Kan Tahlili",
        summary: "Analiz ediliyor…",
        flaggedCount: 0,
        status: "analyzing",
        fileName,
      },
    ];
    emit();
    return id;
  },
  remove(id: string) {
    tests = tests.filter((t) => t.id !== id);
    emit();
  },
  reset() {
    tests = [];
    emit();
  },
};

/** Subscribe to the blood-test history (newest → oldest). */
export function useBloodTests(): BloodTestSummary[] {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(() => sorted(raw), [raw]);
}
