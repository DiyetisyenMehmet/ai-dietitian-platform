/**
 * Operational API error carrying an HTTP status code and a stable, machine
 * readable error code. Anything thrown as an `ApiError` is considered an
 * expected/handled failure (as opposed to an unexpected programmer error).
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    options: { code?: string; details?: unknown; isOperational?: boolean } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = options.code ?? defaultCodeForStatus(statusCode);
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;

    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = "Bad request", details?: unknown): ApiError {
    return new ApiError(400, message, { code: "BAD_REQUEST", details });
  }

  static unauthorized(message = "Unauthorized"): ApiError {
    return new ApiError(401, message, { code: "UNAUTHORIZED" });
  }

  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError(403, message, { code: "FORBIDDEN" });
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, message, { code: "NOT_FOUND" });
  }

  static conflict(message = "Conflict", details?: unknown): ApiError {
    return new ApiError(409, message, { code: "CONFLICT", details });
  }

  static unprocessable(message = "Unprocessable entity", details?: unknown): ApiError {
    return new ApiError(422, message, { code: "UNPROCESSABLE_ENTITY", details });
  }

  static tooManyRequests(message = "Too many requests"): ApiError {
    return new ApiError(429, message, { code: "TOO_MANY_REQUESTS" });
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError(500, message, { code: "INTERNAL_SERVER_ERROR", isOperational: false });
  }
}

function defaultCodeForStatus(statusCode: number): string {
  const map: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_SERVER_ERROR",
  };
  return map[statusCode] ?? (statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "ERROR");
}
