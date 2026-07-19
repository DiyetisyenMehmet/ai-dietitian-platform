"use client";

import * as React from "react";

import type { Achievement, HealthProfile } from "@/domain/health/types";

/**
 * In-memory health-profile store shared across routes via useSyncExternalStore.
 *
 * Stands in for a backend/global data layer with no external dependencies;
 * state lives for the browser session only (placeholder behavior consistent
 * with the meals/goals/chat stores). The shape is backend-ready so it can be
 * swapped for a real data source without touching presentation components.
 */

/** ISO date offset (in days from today) as YYYY-MM-DD. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seedProfile(): HealthProfile {
  return {
    fullName: "Mehmet",
    age: 34,
    gender: "MALE",
    heightCm: 178,
    startWeightKg: 82,
    currentWeightKg: 78.4,
    targetWeightKg: 75,
    activityLevel: "MODERATE",
    dietaryPreference: "OMNIVORE",
    healthConditions: ["Hipertansiyon", "İnsülin Direnci"],
    allergies: ["Fıstık"],
    dailyCalorieGoal: 2200,
    dailyWaterGoalMl: 2500,
    memberSince: isoOffset(-40),
  };
}

function seedAchievements(): Achievement[] {
  return [
    {
      id: "ach-profile",
      title: "Yolculuk Başladı",
      description: "Sağlık profilini oluşturdun.",
      icon: "user",
      unlockedAt: isoOffset(-40),
    },
    {
      id: "ach-first-plan",
      title: "İlk Plan",
      description: "Yapay zekâ ilk beslenme planını hazırladı.",
      icon: "sparkles",
      unlockedAt: isoOffset(-38),
    },
    {
      id: "ach-blood-test",
      title: "Sağlık Kontrolü",
      description: "İlk kan tahlilini yükledin.",
      icon: "flask",
      unlockedAt: isoOffset(-30),
    },
    {
      id: "ach-3kg",
      title: "3 Kilo Daha Hafif",
      description: "Başlangıçtan bu yana 3 kg verdin.",
      icon: "scale",
      unlockedAt: isoOffset(-6),
    },
    {
      id: "ach-streak-7",
      title: "7 Gün İstikrar",
      description: "7 gün üst üste takip yaptın.",
      icon: "flame",
      unlockedAt: null,
    },
    {
      id: "ach-goal",
      title: "Hedefe Ulaştın",
      description: "Hedef kilona ulaş ve bu rozeti kazan.",
      icon: "trophy",
      unlockedAt: null,
    },
  ];
}

let profile: HealthProfile = seedProfile();
const achievements: Achievement[] = seedAchievements();
const listeners = new Set<() => void>();

function emit() {
  profile = { ...profile };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return profile;
}

export const healthProfileStore = {
  /** Patches the profile (e.g. from the profile editor). */
  update(patch: Partial<HealthProfile>) {
    profile = { ...profile, ...patch };
    emit();
  },
  /** Syncs the current weight (called by the weight store on new entries). */
  setCurrentWeight(weightKg: number) {
    if (profile.currentWeightKg === weightKg) return;
    profile = { ...profile, currentWeightKg: weightKg };
    emit();
  },
  getAchievements(): Achievement[] {
    return achievements;
  },
};

/** Subscribe to the shared health profile. */
export function useHealthProfile(): HealthProfile {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Returns the (static) achievement list. */
export function useAchievements(): Achievement[] {
  return achievements;
}
