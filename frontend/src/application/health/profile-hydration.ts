"use client";

import { onboardingClient } from "@/infrastructure/onboarding/onboarding-client";
import type { OnboardingProfile } from "@/domain/onboarding/types";
import { mealsStore } from "@/application/meals/meals-store";
import { healthProfileStore } from "./health-profile-store";
import { weightStore } from "./weight-store";
import { dailyTrackingStore } from "./daily-tracking-store";
import { journeyStore } from "./journey-store";
import { bloodTestStore } from "./blood-test-store";
import { activityStore } from "./activity-store";

/** Last authenticated account whose client caches were hydrated. */
let cacheOwnerUserId: string | null = null;

/**
 * Clears user-specific browser caches before switching accounts. This prevents
 * one account's nutrition/health data from flashing or surviving when another
 * account signs in on the same browser session.
 */
function resetUserCaches(): void {
  healthProfileStore.reset();
  weightStore.clear();
  dailyTrackingStore.reset();
  mealsStore.reset();
  journeyStore.reset();
  bloodTestStore.reset();
  activityStore.reset();
}

/**
 * Hydrates scalar caches from the authoritative onboarding profile. Time-series
 * records (weight/water/meals/activity/etc.) are hydrated separately from their
 * own backend endpoints so historical data is never replaced by a fake local
 * series.
 */
export function hydrateStoresFromProfile(profile: OnboardingProfile, fullName: string): void {
  healthProfileStore.update({
    fullName,
    age: profile.age,
    gender: profile.gender,
    heightCm: profile.heightCm,
    // `startWeightKg` is the onboarding/profile baseline. Persisted weight logs
    // may later update only `currentWeightKg` through the weight store.
    startWeightKg: profile.currentWeightKg,
    currentWeightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    activityLevel: profile.activityLevel,
    dietaryPreference: profile.dietaryPreference,
    healthConditions: profile.healthConditions,
    allergies: profile.allergies,
    dailyWaterGoalMl: profile.dailyWaterGoalMl,
  });
  dailyTrackingStore.setWaterGoal(profile.dailyWaterGoalMl);
}

/**
 * Fetches authoritative user/profile + tracking data and hydrates session caches.
 *
 * - Account changes clear all user-specific caches before any network response.
 * - Full name comes from the authenticated account, so it remains correct even
 *   if the profile endpoint is temporarily unavailable.
 * - Each domain hydrates from its own persisted backend source.
 * - Failures are isolated; one unavailable domain does not block the rest.
 */
export async function hydrateProfileFromBackend(userId: string, fullName: string): Promise<void> {
  const ownerChanged = cacheOwnerUserId !== userId;
  if (ownerChanged) {
    resetUserCaches();
    cacheOwnerUserId = userId;
  }

  // Account identity is already authenticated and is safe to show independently
  // of the optional onboarding-profile request.
  healthProfileStore.update({ fullName });

  let profile: OnboardingProfile | null = null;
  try {
    const response = await onboardingClient.getProfile();
    profile = response.profile;
    if (profile) hydrateStoresFromProfile(profile, fullName);
  } catch {
    // Keep neutral caches + authenticated name; do not fall back to demo values.
  }

  await Promise.all([
    dailyTrackingStore.hydrateWaterFromBackend(),
    mealsStore.hydrateMealsFromBackend(),
    journeyStore.hydrateJourneyFromBackend(),
    bloodTestStore.hydrateBloodTestsFromBackend(),
    activityStore.hydrateFromBackend(),
    weightStore.hydrateWeightFromBackend(profile?.currentWeightKg),
  ]);
}

/** Explicitly clears all health caches when the authenticated account logs out. */
export function clearHydratedProfileCaches(): void {
  cacheOwnerUserId = null;
  resetUserCaches();
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
