import { Router } from "express";

import { checkDatabaseConnection } from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess, sendError } from "../utils/api-response";

export const healthRouter = Router();

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe
 *     description: Returns basic service status and uptime.
 *     responses:
 *       200:
 *         description: Service is up.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
healthRouter.get("/", (_req, res) => {
  sendSuccess(res, {
    status: "ok",
    service: "ai-dietitian-backend",
    version: "0.1.0",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * @openapi
 * /api/health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe
 *     description: Verifies downstream dependencies (database) are reachable.
 *     responses:
 *       200:
 *         description: Service and dependencies are ready.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       503:
 *         description: A dependency is unavailable.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const databaseReady = await checkDatabaseConnection();

    if (!databaseReady) {
      sendError(res, 503, "SERVICE_UNAVAILABLE", "Database is not reachable.", {
        database: "down",
      });
      return;
    }

    sendSuccess(res, {
      status: "ready",
      checks: { database: "up" },
      timestamp: new Date().toISOString(),
    });
  }),
);
