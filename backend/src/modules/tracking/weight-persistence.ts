import type { Prisma, WeightLog } from "@prisma/client";

export const WEIGHT_BASELINE_NOTE = "Başlangıç";
export const PROFILE_WEIGHT_UPDATE_NOTE = "Profil güncellemesi";

/**
 * Stable newest-first ordering for weight history. `loggedAt` is the domain
 * timestamp; `createdAt` and `id` only break ties deterministically.
 */
export function weightLogOrderBy(): Prisma.WeightLogOrderByWithRelationInput[] {
  return [{ loggedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }];
}

/**
 * Serializes all weight mutations for one authenticated account. PostgreSQL row
 * locks are transaction-scoped, so concurrent requests cannot leave the scalar
 * profile weight pointing at a chronologically older measurement.
 */
export async function lockUserWeightMutation(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "users"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;
}

/**
 * Re-derives the profile scalar from the chronologically latest persisted
 * measurement. Caller must hold `lockUserWeightMutation` in the same
 * transaction. A null result means the user has no weight history.
 */
export async function syncCurrentWeightFromHistory(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<WeightLog | null> {
  const latest = await tx.weightLog.findFirst({
    where: { userId },
    orderBy: weightLogOrderBy(),
  });

  if (latest) {
    await tx.userProfile.updateMany({
      where: { userId },
      data: { currentWeightKg: latest.weightKg },
    });
  }

  return latest;
}

/**
 * Creates a time-series measurement and then derives `currentWeightKg` from the
 * actual latest WeightLog rather than request arrival order. Caller must hold
 * `lockUserWeightMutation` inside the same transaction.
 */
export async function createWeightLogAndSyncCurrent(
  tx: Prisma.TransactionClient,
  data: {
    userId: string;
    weightKg: number;
    note?: string;
    loggedAt?: Date;
  },
): Promise<WeightLog> {
  const log = await tx.weightLog.create({ data });
  await syncCurrentWeightFromHistory(tx, data.userId);
  return log;
}
