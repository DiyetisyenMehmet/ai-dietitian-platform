import type { Prisma, User, UserProfile } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import {
  createWeightLogAndSyncCurrent,
  lockUserWeightMutation,
  PROFILE_WEIGHT_UPDATE_NOTE,
  WEIGHT_BASELINE_NOTE,
} from "../tracking/weight-persistence";

/**
 * Data-access layer for the onboarding module. All profile persistence lives
 * here so the service stays storage-agnostic.
 */
export const onboardingRepository = {
  findProfileByUserId(userId: string): Promise<UserProfile | null> {
    return prisma.userProfile.findUnique({ where: { userId } });
  },

  /**
   * Persists the onboarding profile and flips the user's `onboardingCompleted`
   * flag in one transaction. The first weight becomes the immutable progress
   * baseline. Later profile weight changes append a WeightLog in that same
   * transaction, eliminating the previous profile/history partial-write path.
   */
  async completeOnboarding(
    userId: string,
    fullName: string,
    profileData: Omit<Prisma.UserProfileCreateInput, "user">,
  ): Promise<{ user: User; profile: UserProfile; weightChanged: boolean }> {
    return prisma.$transaction(async (tx) => {
      await lockUserWeightMutation(tx, userId);
      const existing = await tx.userProfile.findUnique({ where: { userId } });
      const weightChanged = Boolean(
        existing && existing.currentWeightKg !== profileData.currentWeightKg,
      );

      let profile = existing
        ? await tx.userProfile.update({ where: { userId }, data: profileData })
        : await tx.userProfile.create({
            data: { ...profileData, user: { connect: { id: userId } } },
          });

      if (!existing) {
        await createWeightLogAndSyncCurrent(tx, {
          userId,
          weightKg: profile.currentWeightKg,
          note: WEIGHT_BASELINE_NOTE,
          loggedAt: profile.createdAt,
        });
        profile = await tx.userProfile.findUniqueOrThrow({ where: { userId } });
      } else if (weightChanged) {
        await createWeightLogAndSyncCurrent(tx, {
          userId,
          weightKg: profile.currentWeightKg,
          note: PROFILE_WEIGHT_UPDATE_NOTE,
        });
        profile = await tx.userProfile.findUniqueOrThrow({ where: { userId } });
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { fullName, onboardingCompleted: true },
      });
      return { user, profile, weightChanged };
    });
  },
};
