"use client";

import { onboardingClient } from "@/infrastructure/onboarding/onboarding-client";
import type { OnboardingProfile } from "@/domain/onboarding/types";
import { mealsStore } from "@/application/meals/meals-store";
import { chatStore } from "@/application/chat/chat-store";
import { healthProfileStore } from "./health-profile-store";
import { weightStore } from "./weight-store";
import { dailyTrackingStore } from "./daily-tracking-store";
import { journeyStore } from "./journey-store";
import { bloodTestStore } from "./blood-test-store";
import { activityStore } from "./activity-store";
import { nutritionPlanStore } from "./nutrition-plan-store";

/** Last authenticated account whose client caches were hydrated. */
let cacheOwnerUserId: string | null = null;

/**
 * Clears user-specific browser caches before switching accounts. This prevents
 * one account's nutrition/health/chat data from flashing or surviving when
 * another account signs in on the same browser session.
 */
function resetUserCaches(): void {
  healthProfileStore.reset();
  weightStore.clear();
  dailyTrackingStore.reset();
  mealsStore.reset();
  journeyStore.reset();
  bloodTestStore.reset();
  activityStore.reset();
  nutritionPlanStore.reset();
  chatStore.resetSession();
}

/**
 * Hydrates scalar caches from the authoritative onboarding profile. Time-series
 * records are hydrated separately from their own backend endpoints so historical
 * data is never replaced by a fake local series.
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
  dailyTrackingStore.setWaterGoal(profile.dailyWaterGoalMl);
}

/**
 * Fetches authoritative user/profile + tracking data and hydrates session caches.
 * Failures are isolated; one unavailable domain does not block the rest.
 */
export async function hydrateProfileFromBackend(userId: string, fullName: string): Promise<void> {
  const ownerChanged = cacheOwnerUserId !== userId;
  if (ownerChanged) {
    resetUserCaches();
    cacheOwnerUserId = userId;
  }

  healthProfileStore.update({ fullName });

  let profile: OnboardingProfile | null = null;
  try {
    const response = await onboardingClient.getProfile();
    profile = response.profile;
    if (profile) hydrateStoresFromProfile(profile, fullName);
  } catch {
    // Keep neutral caches + authenticated name; do not fall back to demo values.
  }

  const nutritionPlanPromise = nutritionPlanStore.hydrateFromBackend();

  const [, , , , , , activePlan] = await Promise.all([
    dailyTrackingStore.hydrateWaterFromBackend(),
    mealsStore.hydrateMealsFromBackend(),
    journeyStore.hydrateJourneyFromBackend(),
    bloodTestStore.hydrateBloodTestsFromBackend(),
    activityStore.hydrateFromBackend(),
    weightStore.hydrateWeightFromBackend(profile?.currentWeightKg),
    nutritionPlanPromise,
  ]);

  // Energy targets only come from a successfully generated, persisted plan.
  healthProfileStore.update({ dailyCalorieGoal: activePlan?.dailyCalories ?? 0 });
}

/** Explicitly clears all user health/chat caches when the session ends. */
export function clearHydratedProfileCaches(): void {
  cacheOwnerUserId = null;
  resetUserCaches();
}

/**
 * Derives a YYYY-MM-DD date of birth for a whole-year age, anchored to today's
 * month/day so the backend re-derives exactly this age.
 */
export function ageToDateOfBirth(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}
