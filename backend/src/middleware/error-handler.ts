import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { isProduction } from "../config/env";
import { ApiError } from "../utils/api-error";
import type { ErrorBody } from "../utils/api-response";

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  isOperational: boolean;
}

/** Maps any thrown value into a normalized, client-safe error shape. */
function normalizeError(error: unknown): NormalizedError {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      isOperational: error.isOperational,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      code: "UNPROCESSABLE_ENTITY",
      message: "Validation failed",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
      isOperational: true,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: record not found; P2002: unique constraint violation.
    if (error.code === "P2025") {
      return {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Requested record was not found.",
        isOperational: true,
      };
    }
    if (error.code === "P2002") {
      return {
        statusCode: 409,
        code: "CONFLICT",
        message: "A record with these details already exists.",
        isOperational: true,
      };
    }
    return {
      statusCode: 400,
      code: "DATABASE_REQUEST_ERROR",
      message: "Database request could not be processed.",
      isOperational: true,
    };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      code: "DATABASE_VALIDATION_ERROR",
      message: "Invalid database query.",
      isOperational: true,
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
    isOperational: false,
  };
}

/**
 * Centralized error handler. Must be registered last. Normalizes every error
 * into the standard error envelope, logs it with the request correlation ID,
 * and hides internal details in production.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // Express requires a 4-arg signature to recognize this as an error handler.
  _next: NextFunction,
): void {
  const normalized = normalizeError(error);

  const log = req.log ?? console;
  const logPayload = { err: error, statusCode: normalized.statusCode, code: normalized.code };
  if (normalized.statusCode >= 500 || !normalized.isOperational) {
    log.error(logPayload, "Request failed");
  } else {
    log.warn(logPayload, "Request rejected");
  }

  const body: ErrorBody = {
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  };

  if (normalized.details !== undefined) {
    body.error.details = normalized.details;
  }

  // Surface the stack only in non-production for debugging convenience.
  if (!isProduction && error instanceof Error) {
    (body.error as Record<string, unknown>).stack = error.stack;
  }

  res.status(normalized.statusCode).json(body);
}
