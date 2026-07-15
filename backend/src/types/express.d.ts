import type { Logger } from "pino";
import type { UserRole } from "@prisma/client";

/** Authenticated principal attached by the `authenticate` middleware. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

// Augment Express types with request-scoped context added by middleware.
declare global {
  namespace Express {
    interface Request {
      /** Correlation ID propagated end-to-end for traceability (AD-043). */
      id: string;
      /** Child logger bound with the request's correlation ID. */
      log: Logger;
      /** Present only on routes protected by the `authenticate` middleware. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
