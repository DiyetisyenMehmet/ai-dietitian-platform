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
   * captured during onboarding is mirrored onto the user record. The profile is
   * upserted to keep the operation idempotent if a client retries.
   */
  async completeOnboarding(
    userId: string,
    fullName: string,
    profileData: Omit<Prisma.UserProfileCreateInput, "user">,
  ): Promise<{ user: User; profile: UserProfile }> {
    return prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        create: { ...profileData, user: { connect: { id: userId } } },
        update: profileData,
      });
      const user = await tx.user.update({
        where: { id: userId },
        data: { fullName, onboardingCompleted: true },
      });
      return { user, profile };
    });
  },
};
