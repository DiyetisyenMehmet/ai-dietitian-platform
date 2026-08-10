"use client";

import * as React from "react";

import type { BloodTestSummary } from "@/domain/health/types";
import {
  bloodTestClient,
  type BloodTestAnalysis,
} from "@/infrastructure/tracking/blood-test-client";

/**
 * Blood-test store shared across routes via useSyncExternalStore.
 *
 * The backend is the single source of truth (Sprint 21.3B): the analysis
 * history is hydrated from `/api/blood-tests/analyses` via
 * `hydrateBloodTestsFromBackend` on login / app startup / refresh. This store
 * is a cache only — it holds no seeded/demo tests and never generates its own
 * analysis results; it starts empty and reflects only what the backend returns.
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
   * Hydrates the analysis history from the backend (single source of truth).
   * Called on login / app startup / refresh. Best-effort: on a transient
   * failure the last known cache is kept and retried on next mount.
   */
  async hydrateBloodTestsFromBackend(): Promise<void> {
    try {
      const { analyses } = await bloodTestClient.listAnalyses();
      tests = analyses.map(toSummary);
      emit();
    } catch {
      // Offline / transient failure: keep the last known cache.
    }
  },
  add(entry: Omit<BloodTestSummary, "id">) {
    tests = [...tests, { ...entry, id: nextId() }];
    emit();
  },
  /**
   * Adds an uploaded blood test to the cache in the "analyzing" state. The
   * store never generates its own analysis result — the real summary and
   * flagged count come from the backend and appear on the next hydration once
   * the analysis pipeline completes. Returns the new (cache-local) id.
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
};

/** Subscribe to the blood-test history (newest → oldest). */
export function useBloodTests(): BloodTestSummary[] {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(() => sorted(raw), [raw]);
}
