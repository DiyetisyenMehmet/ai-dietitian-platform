import type { Prisma, User, UserProfile } from "@prisma/client";

import { prisma } from "../../lib/prisma";

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
   * flag in a single transaction, so the gate can never be half-set. `fullName`
   * captured during onboarding is mirrored onto the user record.
   *
   * On first completion we also persist the onboarding weight as the first
   * WeightLog. That row is the immutable progress baseline; later weigh-ins may
   * update `currentWeightKg` but must never rewrite where the journey started.
   */
  async completeOnboarding(
    userId: string,
    fullName: string,
    profileData: Omit<Prisma.UserProfileCreateInput, "user">,
  ): Promise<{ user: User; profile: UserProfile }> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.userProfile.findUnique({ where: { userId } });

      const profile = existing
        ? await tx.userProfile.update({ where: { userId }, data: profileData })
        : await tx.userProfile.create({
            data: { ...profileData, user: { connect: { id: userId } } },
          });

      if (!existing) {
        await tx.weightLog.create({
          data: {
            userId,
            weightKg: profile.currentWeightKg,
            note: "Başlangıç",
            loggedAt: profile.createdAt,
          },
        });
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { fullName, onboardingCompleted: true },
      });
      return { user, profile };
    });
  },
};
