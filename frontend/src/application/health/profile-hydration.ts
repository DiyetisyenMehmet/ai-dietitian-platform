"use client";

import { onboardingClient } from "@/infrastructure/onboarding/onboarding-client";
import type { OnboardingProfile } from "@/domain/onboarding/types";
import { goalsStore } from "@/application/goals/goals-store";
import { mealsStore } from "@/application/meals/meals-store";
import { healthProfileStore } from "./health-profile-store";
import { weightStore } from "./weight-store";
import { dailyTrackingStore } from "./daily-tracking-store";

/**
 * Single place that hydrates the client-side caches from the authoritative
 * backend profile. The backend is the single source of truth (Sprint 21.3);
 * these stores are caches only and must never surface their own seed/demo data
 * once a real profile exists.
 *
 * Reuses the existing store mutators (no duplicated logic):
 *  - healthProfileStore.update — scalar profile read by every screen
 *  - weightStore.reset         — weight time-series (charts / analysis)
 *  - goalsStore.syncFromProfile — weight & water goals
 */
export function hydrateStoresFromProfile(profile: OnboardingProfile, fullName: string): void {
  healthProfileStore.update({
    fullName,
    age: profile.age,
    gender: profile.gender,
    heightCm: profile.heightCm,
    startWeightKg: profile.currentWeightKg,
    currentWeightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    activityLevel: profile.activityLevel,
    dietaryPreference: profile.dietaryPreference,
    healthConditions: profile.healthConditions,
    allergies: profile.allergies,
    dailyWaterGoalMl: profile.dailyWaterGoalMl,
  });
  weightStore.reset(profile.currentWeightKg);
  goalsStore.syncFromProfile({
    currentWeightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    dailyWaterGoalMl: profile.dailyWaterGoalMl,
  });
  // Water goal is a profile value; today's water total is hydrated separately
  // from the tracking logs (see hydrateProfileFromBackend).
  dailyTrackingStore.setWaterGoal(profile.dailyWaterGoalMl);
}

/**
 * Fetches the authoritative profile from the backend (GET /onboarding) and
 * hydrates all caches. Best-effort and idempotent — safe to call on login, on
 * app startup / refresh and after a profile edit. No-op while onboarding is
 * still pending (backend returns a null profile). Never throws so callers (e.g.
 * the route guard) stay resilient to transient network errors.
 */
export async function hydrateProfileFromBackend(fullName: string): Promise<void> {
  try {
    const { profile } = await onboardingClient.getProfile();
    if (profile) hydrateStoresFromProfile(profile, fullName);
  } catch {
    // Offline / transient failure: keep the last known cache, retry on next mount.
  }
  // Today's water total and meals live in the tracking logs, independent of the
  // profile (each has its own best-effort try/catch), so hydrate them regardless
  // of the profile call.
  await Promise.all([
    dailyTrackingStore.hydrateWaterFromBackend(),
    mealsStore.hydrateMealsFromBackend(),
  ]);
}

/**
 * Derives a YYYY-MM-DD date of birth for a whole-year age, anchored to today's
 * month/day so the backend re-derives exactly this age. The profile editor
 * exposes age (not a birth date), while the backend onboarding contract expects
 * dateOfBirth — this bridges the two without changing either contract.
 */
export function ageToDateOfBirth(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}
