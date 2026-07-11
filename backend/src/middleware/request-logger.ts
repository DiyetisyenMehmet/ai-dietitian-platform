import { pinoHttp } from "pino-http";

import { logger } from "../lib/logger";
import { CORRELATION_ID_HEADER } from "./correlation-id";

/**
 * HTTP request/response logger. Reuses the app logger and the correlation ID
 * assigned upstream so every request line is traceable.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = res.getHeader(CORRELATION_ID_HEADER);
    if (typeof existing === "string") return existing;
    const header = req.headers[CORRELATION_ID_HEADER];
    return Array.isArray(header) ? header[0] : (header ?? "");
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  autoLogging: {
    // Avoid noise from health/metrics probes.
    ignore: (req) => req.url === "/health" || req.url === "/api/health",
  },
});
