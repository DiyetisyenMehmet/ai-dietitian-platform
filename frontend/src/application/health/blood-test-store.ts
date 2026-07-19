"use client";

import * as React from "react";

import type { BloodTestSummary } from "@/domain/health/types";

/**
 * In-memory blood-test store shared via useSyncExternalStore. Placeholder data
 * layer consistent with the other health stores; state lives for the session.
 *
 * Blood tests feed the health profile (medical context) and the health journey
 * timeline. The shape is backend-ready so it can later be swapped for a real
 * document-analysis data source without touching presentation components.
 */

let uid = 0;
const nextId = () => `bt-${Date.now()}-${uid++}`;

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seed(): BloodTestSummary[] {
  return [
    {
      id: nextId(),
      date: isoOffset(-30),
      title: "Tam Kan & Metabolik Panel",
      summary:
        "Açlık kan şekeri hafif yüksek, HbA1c sınırda. Sodyum ve kolesterol takibi öneriliyor.",
      flaggedCount: 2,
    },
  ];
}

let tests: BloodTestSummary[] = seed();
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
  add(entry: Omit<BloodTestSummary, "id">) {
    tests = [...tests, { ...entry, id: nextId() }];
    emit();
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
