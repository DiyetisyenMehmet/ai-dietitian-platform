"use client";

import * as React from "react";

import type { WeightEntry } from "@/domain/health/types";
import { trackingClient, type WeightLog } from "@/infrastructure/tracking/tracking-client";
import { healthProfileStore } from "./health-profile-store";

/**
 * Weight-tracking cache backed by `/api/tracking/weight`.
 *
 * There is intentionally NO seeded/demo weight history. The backend is the
 * authoritative source for measurements; when a user has no persisted logs we
 * may show a single baseline derived from their real onboarding profile.
 */

/** Recommended cadence between weigh-ins, in days. */
export const WEIGH_IN_INTERVAL_DAYS = 7;

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
 * Backend permits multiple measurements per day. For the compact daily chart we
 * keep the newest measurement for each calendar day while preserving every row
 * in the database for audit/history purposes.
 */
function collapseToLatestPerDay(logs: WeightLog[]): WeightEntry[] {
  const latestByDay = new Map<string, WeightLog>();
  for (const log of logs) {
    const day = log.loggedAt.slice(0, 10);
    const existing = latestByDay.get(day);
    if (!existing || new Date(log.loggedAt).getTime() > new Date(existing.loggedAt).getTime()) {
      latestByDay.set(day, log);
    }
  }
  return [...latestByDay.values()].map(toEntry);
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

/** Entries sorted oldest → newest. */
function sorted(list: WeightEntry[]): WeightEntry[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

function syncLatestProfileWeight(): void {
  const latest = sorted(entries).at(-1);
  if (latest) healthProfileStore.setCurrentWeight(latest.weightKg);
}

export const weightStore = {
  /**
   * Replaces the cache with persisted measurements. If the account has never
   * logged weight, an optional REAL onboarding weight can be used as the visual
   * baseline without writing a synthetic tracking record to the backend.
   */
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
            note: "Başlangıç",
          },
        ];
      }
      emit();
      syncLatestProfileWeight();
    } catch {
      // Never keep another session/user's stale weight cache after a failed
      // hydration. A real profile baseline is safe to show when available.
      entries =
        profileBaselineKg && profileBaselineKg > 0
          ? [
              {
                id: "profile-baseline",
                date: isoToday(),
                weightKg: profileBaselineKg,
                note: "Başlangıç",
              },
            ]
          : [];
      emit();
      syncLatestProfileWeight();
    }
  },

  /**
   * Persists the measurement FIRST, then updates the cache from the authoritative
   * backend row. Callers should await this and surface any error to the user.
   */
  async add(weightKg: number, note?: string): Promise<void> {
    const { log } = await trackingClient.logWeight(weightKg, note);
    const entry = toEntry(log);
    entries = [
      ...entries.filter((existing) => existing.date !== entry.date),
      entry,
    ];
    emit();
    syncLatestProfileWeight();
  },

  /** Clears all user-specific cached measurements. */
  clear() {
    entries = [];
    emit();
  },
};

/** Subscribe to the chronological (oldest → newest) weight history. */
export function useWeightEntries(): WeightEntry[] {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(() => sorted(raw), [raw]);
}

/** Direction of the weight goal derived from start vs. target. */
export type WeightDirection = "lose" | "gain" | "maintain";

export interface WeightAnalysis {
  direction: WeightDirection;
  latestKg: number | null;
  startKg: number | null;
  targetKg: number;
  /** Signed change since the first entry (kg). Negative = lost weight. */
  changeKg: number;
  /** 0..100 progress toward the target. */
  progressPercent: number;
  /** True when today is on/after the next recommended weigh-in date. */
  isWeighInDue: boolean;
  daysSinceLast: number | null;
  /** Coaching verdict about pace vs. plan. */
  status: "ahead" | "on-track" | "behind" | "reached" | "no-data";
  /** Encouraging, non-shaming coach message. */
  message: string;
}

/**
 * Derives weight progress + a supportive coaching verdict.
 * Never shames the user: "behind" is framed as a gentle nudge.
 */
export function analyzeWeight(entries: WeightEntry[], targetKg: number): WeightAnalysis {
  const list = sorted(entries);
  const first = list[0] ?? null;
  const latest = list.at(-1) ?? null;

  if (!first || !latest || targetKg <= 0) {
    return {
      direction: "maintain",
      latestKg: latest?.weightKg ?? null,
      startKg: first?.weightKg ?? null,
      targetKg,
      changeKg: 0,
      progressPercent: 0,
      isWeighInDue: true,
      daysSinceLast: latest
        ? Math.max(
            0,
            Math.round((Date.now() - new Date(latest.date).getTime()) / 86_400_000),
          )
        : null,
      status: "no-data",
      message: "Kilo hedefin ve ölçümlerin hazır olduğunda ilerlemeni burada takip edeceğiz.",
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

  // Expected linear pace from start date to now (temporary 90-day coaching
  // heuristic; it does NOT change calorie targets or medical guidance).
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
