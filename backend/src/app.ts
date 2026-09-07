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

  // Trust only the explicitly configured number of reverse-proxy hops. Setting
  // this to 0 disables proxy trust and prevents X-Forwarded-For from affecting
  // req.ip/rate limiting when the service is exposed directly.
  app.set("trust proxy", env.TRUST_PROXY_HOPS === 0 ? false : env.TRUST_PROXY_HOPS);
  app.disable("x-powered-by");

  app.use(helmet());

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );

  app.use(compression());

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  app.use(correlationId);
  app.use(requestLogger);

  app.use(env.API_PREFIX, rateLimiter);

  if (env.ENABLE_API_DOCS) {
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.get("/docs.json", (_req, res) => {
      res.json(swaggerSpec);
    });
  }

  app.use(env.API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
