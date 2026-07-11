import type { Response } from "express";

/** Pagination metadata attached to list responses. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Standard envelope for successful responses. */
export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/** Standard envelope for error responses. */
export interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Sends a standardized success response. Using a single envelope shape across
 * the whole API keeps clients simple and predictable.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
): Response<SuccessBody<T>> {
  const body: SuccessBody<T> = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

/** Sends a 201 Created success response. */
export function sendCreated<T>(res: Response, data: T): Response<SuccessBody<T>> {
  return sendSuccess(res, data, 201);
}

/** Sends a 204 No Content response. */
export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

/** Sends a paginated success response with pagination metadata. */
export function sendPaginated<T>(
  res: Response,
  items: T[],
  pagination: PaginationMeta,
  statusCode = 200,
): Response<SuccessBody<T[]>> {
  return sendSuccess(res, items, statusCode, { pagination });
}

/** Sends a standardized error response. */
export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Response<ErrorBody> {
  const body: ErrorBody = { success: false, error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return res.status(statusCode).json(body);
}

/** Builds pagination metadata from raw values. */
export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
