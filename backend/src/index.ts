import type { Server } from "node:http";

import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { checkDatabaseConnection, disconnectPrisma } from "./lib/prisma";

async function bootstrap(): Promise<void> {
  const app = createApp();

  // Warn (do not crash) if the database is unreachable at startup; the
  // readiness probe reflects the live state and the app can still boot.
  const dbReady = await checkDatabaseConnection();
  if (!dbReady) {
    logger.warn("Starting without a verified database connection.");
  }

  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, docs: `http://localhost:${env.PORT}/docs` },
      "Backend server started",
    );
  });

  registerShutdownHandlers(server);
}

/** Gracefully drains connections and closes resources on termination. */
function registerShutdownHandlers(server: Server): void {
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");
    server.close(() => {
      void disconnectPrisma().finally(() => {
        logger.info("Shutdown complete.");
        process.exit(0);
      });
    });

    // Force exit if graceful shutdown stalls.
    setTimeout(() => {
      logger.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    process.exit(1);
  });
}

void bootstrap();
