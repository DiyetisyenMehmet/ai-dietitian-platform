import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { logger } from "../lib/logger";

/** Header used to receive/propagate the correlation ID. */
export const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * Assigns a correlation ID to every request (reusing an incoming one when
 * present) and exposes a request-scoped child logger. The ID is echoed back
 * in the response header so clients and downstream services can correlate
 * logs end-to-end (AD-043).
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_ID_HEADER);
  const id = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

  req.id = id;
  req.log = logger.child({ correlationId: id });
  res.setHeader(CORRELATION_ID_HEADER, id);

  next();
}
