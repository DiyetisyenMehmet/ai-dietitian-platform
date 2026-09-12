import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "@prisma/client";

import { authRepository } from "../modules/auth/auth.repository";
import { ApiError } from "../utils/api-error";
import { verifyAccessToken } from "../utils/jwt";

function makeAuthenticationMiddleware(allowGuest: boolean): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
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
      const user = await authRepository.findUserById(claims.sub);
      if (!user?.isActive) {
        next(ApiError.unauthorized("Session is no longer valid."));
        return;
      }

      const isGuest = claims.email.endsWith("@guest.diewish.invalid");
      if (isGuest && !allowGuest) {
        next(ApiError.forbidden("Guest mode does not allow access to this feature."));
        return;
      }

      req.user = {
        id: claims.sub,
        email: claims.email,
        role: claims.role,
        isGuest,
        authenticatedAt: typeof claims.iat === "number" ? claims.iat : 0,
      };
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
        return;
      }
      next(ApiError.unauthorized("Invalid or expired access token."));
    }
  };
}

export const authenticate: RequestHandler = makeAuthenticationMiddleware(false);
export const authenticateAny: RequestHandler = makeAuthenticationMiddleware(true);

/**
 * Role guard. Must be mounted after authentication. Restricts a route to the
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
