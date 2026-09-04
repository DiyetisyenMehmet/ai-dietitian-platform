"use client";

import * as React from "react";

import type { Achievement, HealthProfile } from "@/domain/health/types";

/**
 * Session cache for the authenticated user's health profile.
 *
 * IMPORTANT: this store intentionally starts with neutral/empty values. It must
 * never invent demo weight, calorie, disease, allergy or achievement data while
 * the real backend profile is still loading or temporarily unavailable. The
 * backend remains the single source of truth; presentation components should
 * treat zero/empty values as "not loaded / not configured yet".
 */

function emptyProfile(): HealthProfile {
  return {
    fullName: "",
    age: 0,
    gender: "PREFER_NOT_TO_SAY",
    heightCm: 0,
    startWeightKg: 0,
    currentWeightKg: 0,
    targetWeightKg: 0,
    activityLevel: "SEDENTARY",
    dietaryPreference: "OMNIVORE",
    healthConditions: [],
    allergies: [],
    dailyCalorieGoal: 0,
    dailyWaterGoalMl: 0,
    memberSince: "",
  };
}

let profile: HealthProfile = emptyProfile();
const achievements: Achievement[] = [];
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
  update(patch: Partial<HealthProfile>) {
    profile = { ...profile, ...patch };
    emit();
  },
  /** Sets the immutable journey baseline from the oldest persisted measurement. */
  setStartWeight(weightKg: number) {
    if (weightKg <= 0 || profile.startWeightKg === weightKg) return;
    profile = { ...profile, startWeightKg: weightKg };
    emit();
  },
  /** Syncs only the current weight; the starting weight is deliberately untouched. */
  setCurrentWeight(weightKg: number) {
    if (profile.currentWeightKg === weightKg) return;
    profile = { ...profile, currentWeightKg: weightKg };
    emit();
  },
  reset() {
    profile = emptyProfile();
    emit();
  },
  getAchievements(): Achievement[] {
    return achievements;
  },
};

export function useHealthProfile(): HealthProfile {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useAchievements(): Achievement[] {
  return achievements;
}
