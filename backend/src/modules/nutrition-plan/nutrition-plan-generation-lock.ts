import { PrismaClient, type Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

const generatingUsers = new Set<string>();
let lockClient: PrismaClient | undefined;

function getLockClient(): PrismaClient {
  // A separate, reusable pool lets ordinary profile/quota reads proceed while
  // the generation transaction holds its advisory lock. Reuse one engine
  // rather than allocating a Prisma engine for every provider request.
  return (lockClient ??= new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: [] }));
}

export async function disconnectNutritionGenerationLocks(): Promise<void> {
  const client = lockClient;
  lockClient = undefined;
  await client?.$disconnect();
}

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
  timeoutMs = 120_000,
): Promise<T> {
  if (generatingUsers.has(userId)) throw inProgress();
  generatingUsers.add(userId);
  const key = `nutrition-plan-generation:${userId}`;
  try {
    return await getLockClient().$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked
      `;
        if (rows[0]?.locked !== true) throw inProgress();
        return generate(transaction);
      },
      { timeout: Math.min(120_000, Math.max(1, timeoutMs)), maxWait: 5_000 },
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2028") {
      if (error instanceof Error && error.message.includes("Unable to start a transaction")) {
        throw new ApiError(503, "Nutrition-plan generation is temporarily busy.", {
          code: "NUTRITION_PLAN_GENERATION_BUSY",
        });
      }
      throw new ApiError(504, "Nutrition-plan generation exceeded its request window.", {
        code: "NUTRITION_PLAN_GENERATION_TIMEOUT",
      });
    }
    throw error;
  } finally {
    generatingUsers.delete(userId);
  }
}
