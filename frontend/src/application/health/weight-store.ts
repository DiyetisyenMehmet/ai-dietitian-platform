"use client";

import * as React from "react";

import type { WeightEntry } from "@/domain/health/types";
import { trackingClient, type WeightLog } from "@/infrastructure/tracking/tracking-client";
import { healthProfileStore } from "./health-profile-store";

export const WEIGH_IN_INTERVAL_DAYS = 7;
const BASELINE_NOTE = "Başlangıç";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function toEntry(log: WeightLog): WeightEntry {
  return {
    id: log.id,
    date: log.loggedAt.slice(0, 10),
    weightKg: log.weightKg,
    ...(log.note ? { note: log.note } : {}),
  };
}

/**
 * Keep one latest ordinary measurement per day, but never collapse away the
 * persisted onboarding baseline when a user weighs in again on that same day.
 */
function collapseToLatestPerDay(logs: WeightLog[]): WeightEntry[] {
  const baseline = logs
    .filter((log) => log.note === BASELINE_NOTE)
    .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime())[0];
  const latestByDay = new Map<string, WeightLog>();

  for (const log of logs) {
    if (baseline && log.id === baseline.id) continue;
    const day = log.loggedAt.slice(0, 10);
    const existing = latestByDay.get(day);
    if (!existing || new Date(log.loggedAt).getTime() > new Date(existing.loggedAt).getTime()) {
      latestByDay.set(day, log);
    }
  }

  return [...(baseline ? [toEntry(baseline)] : []), ...[...latestByDay.values()].map(toEntry)];
}

let entries: WeightEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  entries = [...entries];
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return entries;
}

/** Stable chronological order; the explicit baseline always wins ties. */
function sorted(list: WeightEntry[]): WeightEntry[] {
  return [...list].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.note === BASELINE_NOTE && b.note !== BASELINE_NOTE) return -1;
    if (b.note === BASELINE_NOTE && a.note !== BASELINE_NOTE) return 1;
    return 0;
  });
}

function syncProfileWeights(): void {
  const list = sorted(entries);
  const first = list[0];
  const latest = list.at(-1);
  if (first) healthProfileStore.setStartWeight(first.weightKg);
  if (latest) healthProfileStore.setCurrentWeight(latest.weightKg);
}

export const weightStore = {
  async hydrateWeightFromBackend(profileBaselineKg?: number): Promise<void> {
    try {
      const { logs } = await trackingClient.listWeight();
      entries = collapseToLatestPerDay(logs);
      if (entries.length === 0 && profileBaselineKg && profileBaselineKg > 0) {
        entries = [
          {
            id: "profile-baseline",
            date: isoToday(),
            weightKg: profileBaselineKg,
            note: BASELINE_NOTE,
          },
        ];
      }
      emit();
      syncProfileWeights();
    } catch {
      entries =
        profileBaselineKg && profileBaselineKg > 0
          ? [
              {
                id: "profile-baseline",
                date: isoToday(),
                weightKg: profileBaselineKg,
                note: BASELINE_NOTE,
              },
            ]
          : [];
      emit();
      syncProfileWeights();
    }
  },

  async add(weightKg: number, note?: string): Promise<void> {
    const { log } = await trackingClient.logWeight(weightKg, note);
    const entry = toEntry(log);
    entries = [
      ...entries.filter(
        (existing) => existing.note === BASELINE_NOTE || existing.date !== entry.date,
      ),
      entry,
    ];
    emit();
    syncProfileWeights();
  },

  clear() {
    entries = [];
    emit();
  },
};

export function useWeightEntries(): WeightEntry[] {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(() => sorted(raw), [raw]);
}

export type WeightDirection = "lose" | "gain" | "maintain";

export interface WeightAnalysis {
  direction: WeightDirection;
  latestKg: number | null;
  startKg: number | null;
  targetKg: number;
  changeKg: number;
  progressPercent: number;
  isWeighInDue: boolean;
  daysSinceLast: number | null;
  status: "ahead" | "on-track" | "behind" | "reached" | "no-data";
  message: string;
}

export function analyzeWeight(entries: WeightEntry[], targetKg: number): WeightAnalysis {
  const list = sorted(entries);
  const first = list[0] ?? null;
  const latest = list.at(-1) ?? null;

  if (!first || !latest || targetKg <= 0 || list.length < 2) {
    return {
      direction: "maintain",
      latestKg: latest?.weightKg ?? null,
      startKg: first?.weightKg ?? null,
      targetKg,
      changeKg: 0,
      progressPercent: 0,
      isWeighInDue: true,
      daysSinceLast: latest
        ? Math.max(0, Math.round((Date.now() - new Date(latest.date).getTime()) / 86_400_000))
        : null,
      status: "no-data",
      message:
        "İlerleme yüzdesi için en az iki farklı kilo ölçümü gerekir. Düzenli ölçüm yaptıkça eğilimin burada görünecek.",
    };
  }

  const startKg = first.weightKg;
  const latestKg = latest.weightKg;
  const direction: WeightDirection =
    targetKg < startKg ? "lose" : targetKg > startKg ? "gain" : "maintain";
  const changeKg = Number((latestKg - startKg).toFixed(1));

  const totalDelta = Math.abs(targetKg - startKg);
  const achievedDelta =
    direction === "lose"
      ? Math.max(0, startKg - latestKg)
      : direction === "gain"
        ? Math.max(0, latestKg - startKg)
        : Math.max(0, 0.3 - Math.abs(latestKg - targetKg));
  const progressPercent =
    totalDelta === 0
      ? Math.abs(latestKg - targetKg) < 0.3
        ? 100
        : 0
      : Math.min(100, Math.max(0, Math.round((achievedDelta / totalDelta) * 100)));

  const today = new Date(isoToday());
  const lastDate = new Date(latest.date);
  const daysSinceLast = Math.max(
    0,
    Math.round((today.getTime() - lastDate.getTime()) / 86_400_000),
  );
  const isWeighInDue = daysSinceLast >= WEIGH_IN_INTERVAL_DAYS;

  const reached =
    (direction === "lose" && latestKg <= targetKg) ||
    (direction === "gain" && latestKg >= targetKg) ||
    (direction === "maintain" && Math.abs(latestKg - targetKg) < 0.3);

  const daysElapsed = Math.max(
    1,
    Math.round((today.getTime() - new Date(first.date).getTime()) / 86_400_000),
  );
  const expectedProgress = Math.min(100, Math.round((daysElapsed / 90) * 100));

  let status: WeightAnalysis["status"];
  let message: string;
  if (reached) {
    status = "reached";
    message = "Hedef kilona ulaştın. Bundan sonraki odağımız bu dengeyi sürdürülebilir biçimde korumak.";
  } else if (progressPercent >= expectedProgress + 8) {
    status = "ahead";
    message = "Hedefine doğru planlanan hızın önünde ilerliyorsun. Hızı değil sürdürülebilirliği korumaya odaklan.";
  } else if (progressPercent >= expectedProgress - 8) {
    status = "on-track";
    message = "Hedefine doğru istikrarlı ilerliyorsun. Düzenli ölçüm, eğilimi daha doğru görmemize yardımcı olur.";
  } else {
    status = "behind";
    message =
      "Son dönemde ilerleme daha yavaş görünüyor. Öğün, aktivite ve uyum verilerini birlikte değerlendirerek sürdürülebilir bir sonraki adımı seçebiliriz.";
  }

  return {
    direction,
    latestKg,
    startKg,
    targetKg,
    changeKg,
    progressPercent,
    isWeighInDue,
    daysSinceLast,
    status,
    message,
  };
}
