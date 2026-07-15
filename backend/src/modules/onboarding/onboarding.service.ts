import type { UserProfile } from "@prisma/client";

import { logger } from "../../lib/logger";
import { onboardingRepository } from "./onboarding.repository";
import type { OnboardingInput } from "./onboarding.schemas";

/** Public-facing profile shape returned to clients (age derived, not stored). */
export interface PublicProfile {
  dateOfBirth: string;
  age: number;
  gender: UserProfile["gender"];
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: UserProfile["activityLevel"];
  healthConditions: string[];
  allergies: string[];
  dietaryPreference: UserProfile["dietaryPreference"];
  dailyWaterGoalMl: number;
  updatedAt: string;
}

/** Computes full-year age from a date of birth relative to now. */
function calculateAge(dateOfBirth: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = now.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

function toPublicProfile(profile: UserProfile): PublicProfile {
  return {
    dateOfBirth: profile.dateOfBirth.toISOString().slice(0, 10),
    age: calculateAge(profile.dateOfBirth),
    gender: profile.gender,
    heightCm: profile.heightCm,
    currentWeightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    activityLevel: profile.activityLevel,
    healthConditions: profile.healthConditions,
    allergies: profile.allergies,
    dietaryPreference: profile.dietaryPreference,
    dailyWaterGoalMl: profile.dailyWaterGoalMl,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export const onboardingService = {
  /** Returns the current user's profile, or null when onboarding is incomplete. */
  async getProfile(userId: string): Promise<PublicProfile | null> {
    const profile = await onboardingRepository.findProfileByUserId(userId);
    return profile ? toPublicProfile(profile) : null;
  },

  /**
   * Persists the mandatory onboarding profile and marks onboarding complete.
   * Returns the stored profile (with derived age) plus the updated completion
   * flag so the client can unlock the app immediately.
   */
  async completeOnboarding(
    userId: string,
    input: OnboardingInput,
  ): Promise<{ onboardingCompleted: boolean; fullName: string; profile: PublicProfile }> {
    const { fullName, dateOfBirth, ...rest } = input;

    const { user, profile } = await onboardingRepository.completeOnboarding(userId, fullName, {
      ...rest,
      // Store as a midnight-UTC calendar date; the column is `@db.Date`.
      dateOfBirth: new Date(`${dateOfBirth}T00:00:00.000Z`),
    });

    logger.info({ userId }, "User completed onboarding");

    return {
      onboardingCompleted: user.onboardingCompleted,
      fullName: user.fullName ?? fullName,
      profile: toPublicProfile(profile),
    };
  },
};
