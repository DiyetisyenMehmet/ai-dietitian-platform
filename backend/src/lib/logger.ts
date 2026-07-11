import pino, { type LoggerOptions } from "pino";

import { env, isProduction } from "../config/env";

/**
 * Application logger (pino). In development it pretty-prints for readability;
 * in production it emits structured JSON suitable for log aggregation.
 */
const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  // Redact common sensitive fields defensively (aligns with PHI/PII handling).
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.token",
    ],
    censor: "[redacted]",
  },
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger = isProduction
  ? pino(options)
  : pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });

export type Logger = typeof logger;
