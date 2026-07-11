import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../utils/api-error";

/** Catches unmatched routes and forwards a 404 to the error handler. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
