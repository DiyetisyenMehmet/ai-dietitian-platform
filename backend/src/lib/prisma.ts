import { PrismaClient } from "@prisma/client";

import { isProduction } from "../config/env";
import { logger } from "./logger";

/**
 * Prisma client singleton.
 *
 * A single client instance is reused across the process. In development we
 * additionally cache it on `globalThis` so hot-reload (tsx watch) does not
 * exhaust the database connection pool by creating a new client per reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ["error", "warn"] : ["query", "error", "warn"],
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

/** Verifies database connectivity; used by the health check and startup. */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error }, "Database connectivity check failed");
    return false;
  }
}

/** Gracefully closes the database connection (called on shutdown). */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
