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
      status: "analyzed",
    },
  ];
}

/** Simulated AI summaries used while a real analysis pipeline is wired later. */
const SIMULATED_SUMMARIES: readonly { summary: string; flaggedCount: number }[] = [
  {
    summary:
      "Değerlerinin çoğu referans aralığında. Kolesterol sınıra yakın; doymuş yağ alımını dengede tutman faydalı olur.",
    flaggedCount: 1,
  },
  {
    summary:
      "Tüm temel değerler normal aralıkta görünüyor. Güzel bir tablo — mevcut beslenme düzenini sürdürebilirsin.",
    flaggedCount: 0,
  },
  {
    summary:
      "Açlık kan şekeri ve HbA1c hafif yüksek. Glisemik yükü düşük öğünlere ağırlık vermeni öneririm.",
    flaggedCount: 2,
  },
];

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
  /**
   * Simulates uploading a blood test: creates an entry in the "analyzing"
   * state, then resolves it to "analyzed" with a summary after a short delay
   * (stands in for the future document-analysis pipeline). Returns the new id.
   */
  upload(fileName: string): string {
    const id = nextId();
    tests = [
      ...tests,
      {
        id,
        date: isoOffset(0),
        title: fileName.replace(/\.[^.]+$/, "") || "Kan Tahlili",
        summary: "Analiz ediliyor…",
        flaggedCount: 0,
        status: "analyzing",
        fileName,
      },
    ];
    emit();

    if (typeof window !== "undefined") {
      const pick = SIMULATED_SUMMARIES[Math.floor(Math.random() * SIMULATED_SUMMARIES.length)];
      window.setTimeout(() => {
        tests = tests.map((t) =>
          t.id === id
            ? { ...t, status: "analyzed", summary: pick.summary, flaggedCount: pick.flaggedCount }
            : t,
        );
        emit();
      }, 2200);
    }
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
