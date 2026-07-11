import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";

import { ApiError } from "../utils/api-error";

/** The request parts that can be validated. */
export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Creates a validation middleware from Zod schemas. Each provided part is
 * parsed and, on success, replaced with the parsed (typed/coerced) value.
 * On failure a 422 ApiError is produced with structured field details.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // req.query is a read-only getter in Express 5; assign defensively.
        Object.defineProperty(req, "query", {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        next(ApiError.unprocessable("Validation failed", details));
        return;
      }
      next(error);
    }
  };
}
