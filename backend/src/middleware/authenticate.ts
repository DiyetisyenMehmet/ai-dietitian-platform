import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "@prisma/client";

import { ApiError } from "../utils/api-error";
import { verifyAccessToken } from "../utils/jwt";

/**
 * Extracts and verifies the Bearer access token from the Authorization header,
 * attaching the authenticated principal to `req.user`. Any missing/invalid
 * token results in a 401 so downstream handlers can assume `req.user` exists.
 */
export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(ApiError.unauthorized("Authentication required."));
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    next(ApiError.unauthorized("Authentication required."));
    return;
  }

  try {
    const claims = verifyAccessToken(token);
    req.user = { id: claims.sub, email: claims.email, role: claims.role };
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired access token."));
  }
};

/**
 * Role guard. Must be mounted after `authenticate`. Restricts a route to the
 * given role(s); a mismatch yields 403.
 */
export function authorize(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized("Authentication required."));
      return;
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      next(ApiError.forbidden("You do not have permission to perform this action."));
      return;
    }
    next();
  };
}
