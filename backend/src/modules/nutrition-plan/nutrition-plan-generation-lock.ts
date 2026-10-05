import { PrismaClient, type Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

const generatingUsers = new Set<string>();

function inProgress(): ApiError {
  return new ApiError(409, "A nutrition plan is already being prepared.", {
    code: "NUTRITION_PLAN_GENERATION_IN_PROGRESS",
  });
}

/** A transaction-scoped advisory lock covers generation across processes and
 * transaction poolers. Completed plan + usage writes use this same transaction,
 * so expiration, disconnect or failure cannot persist an unlocked generation.
 * The deadline matches the existing staging backend request window (120s). */
export async function withNutritionGenerationLock<T>(
  userId: string,
  generate: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (generatingUsers.has(userId)) throw inProgress();
  generatingUsers.add(userId);
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set("connection_limit", "1");
  const lockClient = new PrismaClient({ datasourceUrl: url.toString(), log: [] });
  const key = `nutrition-plan-generation:${userId}`;
  try {
    return await lockClient.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked
      `;
        if (rows[0]?.locked !== true) throw inProgress();
        return generate(transaction);
      },
      { timeout: 120_000, maxWait: 5_000 },
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2028") {
      throw new ApiError(504, "Nutrition-plan generation exceeded its request window.", {
        code: "NUTRITION_PLAN_GENERATION_TIMEOUT",
      });
    }
    throw error;
  } finally {
    try {
      await lockClient.$disconnect();
    } finally {
      generatingUsers.delete(userId);
    }
  }
}
