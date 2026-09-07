import { Prisma, type User, type UserProfile } from "@prisma/client";

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
   * flag in one transaction, so the gate can never be half-set. PostgreSQL can
   * still surface a unique-key race when two first-time `upsert` calls both see
   * no profile and attempt the initial insert. In that one narrowly identified
   * case we retry the complete transaction once; the second attempt observes the
   * committed profile and follows the update path. All unrelated DB errors are
   * propagated unchanged.
   */
  async completeOnboarding(
    userId: string,
    fullName: string,
    profileData: Omit<Prisma.UserProfileCreateInput, "user">,
  ): Promise<{ user: User; profile: UserProfile }> {
    const persist = () =>
      prisma.$transaction(async (tx) => {
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

    try {
      return await persist();
    } catch (error) {
      if (!isUserProfileUniqueRace(error)) throw error;
      return persist();
    }
  },
};

function isUserProfileUniqueRace(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("userId");
  }
  return typeof target === "string" && target.includes("userId");
}
