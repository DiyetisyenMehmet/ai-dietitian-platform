"use client";

import * as React from "react";

import type { WeightEntry } from "@/domain/health/types";
import { onboardingClient } from "@/infrastructure/onboarding/onboarding-client";
import {
  trackingClient,
  type WeightCheckInStatus,
  type WeightLog,
} from "@/infrastructure/tracking/tracking-client";
import {
  calendarDaySpan,
  dateKeyToLocalNoon,
  isValidWeightKg,
  localDateKey,
  localDateKeyFromIso,
  sortWeightEntries,
  type WeightEntryTiming,
} from "./weight-utils";
import { healthProfileStore } from "./health-profile-store";

export const WEIGH_IN_INTERVAL_DAYS = 7;
const BASELINE_NOTE = "Başlangıç";

function toEntry(log: WeightLog): WeightEntry & WeightEntryTiming {
  return {
    id: log.id,
    date: localDateKeyFromIso(log.loggedAt),
    weightKg: log.weightKg,
    loggedAt: log.loggedAt,
    createdAt: log.createdAt,
    ...(log.note ? { note: log.note } : {}),
  };
}

function fallbackBaseline(weightKg: number): WeightEntry & WeightEntryTiming {
  const today = localDateKey();
  return {
    id: "profile-baseline",
    date: today,
    weightKg,
    loggedAt: dateKeyToLocalNoon(today)?.toISOString(),
    note: BASELINE_NOTE,
  };
}

let entries: WeightEntry[] = [];
let checkInStatus: WeightCheckInStatus | null = null;
let addInFlight: Promise<WeightAddResult> | null = null;
const listeners = new Set<() => void>();
const checkInListeners = new Set<() => void>();

function emit() {
  entries = [...entries];
  listeners.forEach((l) => l());
}

function emitCheckIn() {
  checkInListeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function subscribeCheckIn(listener: () => void) {
  checkInListeners.add(listener);
  return () => checkInListeners.delete(listener);
}

function getSnapshot() {
  return entries;
}

function getCheckInSnapshot() {
  return checkInStatus;
}

function syncStartingWeight(): void {
  const list = sortWeightEntries(entries);
  const baseline = list.find((entry) => entry.note === BASELINE_NOTE) ?? list[0];
  if (baseline) healthProfileStore.setStartWeight(baseline.weightKg);
}

async function refreshCheckInStatus(): Promise<WeightCheckInStatus | null> {
  try {
    const { checkIn } = await trackingClient.getWeightCheckIn();
    checkInStatus = checkIn;
  } catch {
    checkInStatus = null;
  }
  emitCheckIn();
  return checkInStatus;
}

export interface WeightAddResult {
  profileSynced: boolean;
  historySynced: boolean;
}

async function performAdd(weightKg: number, note?: string, dateKey?: string): Promise<WeightAddResult> {
  if (!isValidWeightKg(weightKg)) {
    throw new Error("INVALID_WEIGHT");
  }

  // A measurement entered for today means "now", not local noon. Sending noon
  // can make a same-day onboarding baseline look chronologically newer and keep
  // currentWeightKg pinned to the baseline. Historical dates still use local
  // noon to preserve their intended calendar day across UTC conversion.
  const isToday = dateKey === localDateKey();
  const loggedAt = dateKey && !isToday ? dateKeyToLocalNoon(dateKey) : undefined;
  if (dateKey && !isToday && !loggedAt) {
    throw new Error("INVALID_WEIGHT_DATE");
  }

  const { log } = await trackingClient.logWeight(weightKg, note, loggedAt ?? undefined);
  const committedEntry = toEntry(log);

  // Refresh history and authoritative profile independently. The POST has already
  // committed, so a secondary refresh failure must not be reported as a failed save.
  const [historyResult, profileResult] = await Promise.allSettled([
    trackingClient.listWeight(),
    onboardingClient.getProfile(),
  ]);

  let historySynced = false;
  if (historyResult.status === "fulfilled") {
    entries = sortWeightEntries(historyResult.value.logs.map(toEntry));
    historySynced = true;
  } else {
    entries = sortWeightEntries([
      ...entries.filter((entry) => entry.id !== committedEntry.id),
      committedEntry,
    ]);
  }
  emit();
  syncStartingWeight();

  let profileSynced = false;
  if (profileResult.status === "fulfilled" && profileResult.value.profile) {
    // currentWeightKg is authoritative on UserProfile. Never infer it from a
    // backdated history insertion on the client.
    healthProfileStore.setCurrentWeight(profileResult.value.profile.currentWeightKg);
    profileSynced = true;
  }

  await refreshCheckInStatus();
  return { profileSynced, historySynced };
}

export const weightStore = {
  async hydrateWeightFromBackend(profileBaselineKg?: number): Promise<void> {
    try {
      const { logs } = await trackingClient.listWeight();
      entries = sortWeightEntries(logs.map(toEntry));
      if (entries.length === 0 && profileBaselineKg && isValidWeightKg(profileBaselineKg)) {
        entries = [fallbackBaseline(profileBaselineKg)];
      }
      emit();
      syncStartingWeight();
    } catch {
      // Do not make already-loaded history disappear during a transient network
      // failure. Use the profile baseline only for a genuinely empty cache.
      if (entries.length === 0 && profileBaselineKg && isValidWeightKg(profileBaselineKg)) {
        entries = [fallbackBaseline(profileBaselineKg)];
        emit();
        syncStartingWeight();
      }
    }
    await refreshCheckInStatus();
  },

  hydrateCheckInFromBackend(): Promise<WeightCheckInStatus | null> {
    return refreshCheckInStatus();
  },

  add(weightKg: number, note?: string, dateKey?: string): Promise<WeightAddResult> {
    if (addInFlight) return addInFlight;
    const operation = performAdd(weightKg, note, dateKey);
    addInFlight = operation;
    void operation.finally(() => {
      if (addInFlight === operation) addInFlight = null;
    });
    return operation;
  },

  clear() {
    entries = [];
    checkInStatus = null;
    addInFlight = null;
    emit();
    emitCheckIn();
  },
};

export function useWeightEntries(): WeightEntry[] {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(() => sortWeightEntries(raw), [raw]);
}

export function useWeightCheckInStatus(): WeightCheckInStatus | null {
  return React.useSyncExternalStore(subscribeCheckIn, getCheckInSnapshot, getCheckInSnapshot);
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
  const list = sortWeightEntries(entries);
  const start = list.find((entry) => entry.note === BASELINE_NOTE) ?? list[0] ?? null;
  const latest = list.at(-1) ?? null;
  const distinctDaySpan = start && latest ? calendarDaySpan(start, latest) : 0;

  if (!start || !latest || targetKg <= 0 || list.length < 2 || distinctDaySpan < 1) {
    return {
      direction: "maintain",
      latestKg: latest?.weightKg ?? null,
      startKg: start?.weightKg ?? null,
      targetKg,
      changeKg: 0,
      progressPercent: 0,
      isWeighInDue: true,
      daysSinceLast: latest
        ? Math.max(0, calendarDaySpan(latest, { ...latest, date: localDateKey() }))
        : null,
      status: "no-data",
      message:
        "İlerleme yüzdesi için farklı günlerde en az iki kilo ölçümü gerekir. Düzenli ölçüm yaptıkça eğilimin burada görünecek.",
    };
  }

  const startKg = start.weightKg;
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

  const todayEntry: WeightEntry = { ...latest, date: localDateKey() };
  const daysSinceLast = calendarDaySpan(latest, todayEntry);
  const isWeighInDue = daysSinceLast >= WEIGH_IN_INTERVAL_DAYS;

  const reached =
    (direction === "lose" && latestKg <= targetKg) ||
    (direction === "gain" && latestKg >= targetKg) ||
    (direction === "maintain" && Math.abs(latestKg - targetKg) < 0.3);

  const daysElapsed = Math.max(1, calendarDaySpan(start, latest));
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
