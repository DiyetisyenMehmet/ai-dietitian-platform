import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import swaggerUi from "swagger-ui-express";

import { corsOrigins, env } from "./config/env";
import { swaggerSpec } from "./docs/swagger";
import { apiRouter } from "./routes";
import { correlationId } from "./middleware/correlation-id";
import { requestLogger } from "./middleware/request-logger";
import { rateLimiter } from "./middleware/rate-limit";
import { notFoundHandler } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";

/**
 * Builds and configures the Express application. Middleware order matters:
 * security → parsing → observability → rate limiting → routes → 404 → errors.
 */
export function createApp(): Application {
  const app = express();

  // Trust the reverse proxy (needed for correct client IPs behind a load balancer).
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Security headers.
  app.use(helmet());

  // CORS — restricted to the configured frontend origin(s).
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );

  // Response compression.
  app.use(compression());

  // Body parsing with sane size limits.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Observability: correlation ID first, then request logging.
  app.use(correlationId);
  app.use(requestLogger);

  // Rate limiting for the API surface.
  app.use(env.API_PREFIX, rateLimiter);

  // API documentation (Swagger UI + raw JSON spec).
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/docs.json", (_req, res) => {
    res.json(swaggerSpec);
  });

  // Application routes.
  app.use(env.API_PREFIX, apiRouter);

  // 404 for unmatched routes, then centralized error handling (registered last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
