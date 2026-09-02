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
    // Calorie targets must come from a real generated nutrition plan. Keeping
    // this at zero is safer than presenting a fabricated universal target.
    dailyCalorieGoal: 0,
    dailyWaterGoalMl: 0,
    memberSince: "",
  };
}

let profile: HealthProfile = emptyProfile();

// Achievements are not yet backed by an authoritative backend endpoint. Showing
// pre-earned demo badges would be misleading, so V1 exposes none until real
// persisted achievement data is implemented.
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
  /** Patches the cache from authoritative backend/user data. */
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
  /** Clears all user-specific cached values (e.g. after account/session switch). */
  reset() {
    profile = emptyProfile();
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

/** Returns persisted achievements when that backend source exists; empty for V1. */
export function useAchievements(): Achievement[] {
  return achievements;
}
