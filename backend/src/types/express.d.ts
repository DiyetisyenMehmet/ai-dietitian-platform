import type { Logger } from "pino";

// Augment Express types with request-scoped context added by middleware.
declare global {
  namespace Express {
    interface Request {
      /** Correlation ID propagated end-to-end for traceability (AD-043). */
      id: string;
      /** Child logger bound with the request's correlation ID. */
      log: Logger;
    }
  }
}

export {};
