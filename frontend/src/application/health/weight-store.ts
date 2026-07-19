"use client";

import * as React from "react";

import type { WeightEntry } from "@/domain/health/types";
import { healthProfileStore } from "./health-profile-store";

/**
 * In-memory weight-tracking store shared via useSyncExternalStore. Placeholder
 * data layer consistent with the other stores; state lives for the session.
 *
 * Recording weight regularly is a core Sprint 17 workflow: the store keeps the
 * chronological entry history and derives progress vs. the target so the coach
 * can explain whether the user is ahead of or behind plan.
 */

let uid = 0;
const nextId = () => `w-${Date.now()}-${uid++}`;

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seed(): WeightEntry[] {
  return [
    { id: nextId(), date: isoOffset(-40), weightKg: 82, note: "Başlangıç" },
    { id: nextId(), date: isoOffset(-33), weightKg: 81.2 },
    { id: nextId(), date: isoOffset(-26), weightKg: 80.3 },
    { id: nextId(), date: isoOffset(-19), weightKg: 79.6 },
    { id: nextId(), date: isoOffset(-12), weightKg: 79.0 },
    { id: nextId(), date: isoOffset(-5), weightKg: 78.4, note: "İyi gidiyor" },
  ];
}

/** Recommended cadence between weigh-ins, in days. */
export const WEIGH_IN_INTERVAL_DAYS = 7;

let entries: WeightEntry[] = seed();
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

export const weightStore = {
  add(weightKg: number, note?: string) {
    const today = isoOffset(0);
    const existing = entries.find((e) => e.date === today);
    if (existing) {
      entries = entries.map((e) =>
        e.id === existing.id ? { ...e, weightKg, note: note ?? e.note } : e,
      );
    } else {
      entries = [...entries, { id: nextId(), date: today, weightKg, note }];
    }
    emit();
    const latest = sorted(entries).at(-1);
    if (latest) healthProfileStore.setCurrentWeight(latest.weightKg);
  },
  remove(id: string) {
    entries = entries.filter((e) => e.id !== id);
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

  if (!first || !latest) {
    return {
      direction: "maintain",
      latestKg: null,
      startKg: null,
      targetKg,
      changeKg: 0,
      progressPercent: 0,
      isWeighInDue: true,
      daysSinceLast: null,
      status: "no-data",
      message: "İlk kilonu kaydederek ilerlemeni takip etmeye başlayalım.",
    };
  }

  const startKg = first.weightKg;
  const latestKg = latest.weightKg;
  const direction: WeightDirection =
    targetKg < startKg ? "lose" : targetKg > startKg ? "gain" : "maintain";
  const changeKg = Number((latestKg - startKg).toFixed(1));

  const totalDelta = Math.abs(targetKg - startKg);
  const achievedDelta = Math.abs(latestKg - startKg);
  const progressPercent =
    totalDelta === 0 ? 100 : Math.min(100, Math.max(0, Math.round((achievedDelta / totalDelta) * 100)));

  const today = new Date(isoOffset(0));
  const lastDate = new Date(latest.date);
  const daysSinceLast = Math.round((today.getTime() - lastDate.getTime()) / 86_400_000);
  const isWeighInDue = daysSinceLast >= WEIGH_IN_INTERVAL_DAYS;

  const reached =
    (direction === "lose" && latestKg <= targetKg) ||
    (direction === "gain" && latestKg >= targetKg) ||
    (direction === "maintain" && Math.abs(latestKg - targetKg) < 0.3);

  // Expected linear pace from start date to now (assumes a ~90-day plan window).
  const daysElapsed = Math.max(
    1,
    Math.round((today.getTime() - new Date(first.date).getTime()) / 86_400_000),
  );
  const expectedProgress = Math.min(100, Math.round((daysElapsed / 90) * 100));

  let status: WeightAnalysis["status"];
  let message: string;
  if (reached) {
    status = "reached";
    message = "Tebrikler! Hedef kilona ulaştın. 🎉 Şimdi bu dengeyi koruma zamanı.";
  } else if (progressPercent >= expectedProgress + 8) {
    status = "ahead";
    message = "Harika gidiyorsun — planından daha hızlı ilerliyorsun. Bu tempoyu sürdürülebilir tut.";
  } else if (progressPercent >= expectedProgress - 8) {
    status = "on-track";
    message = "Planına göre yolundasın. İstikrarlı ilerleyişin çok değerli, böyle devam.";
  } else {
    status = "behind";
    message =
      "Son dönemde ilerlemen bir miktar yavaşladı. Sorun değil — birlikte nedenine bakıp planını nazikçe ayarlayabiliriz.";
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
