import type { NextFunction, Request, RequestHandler, Response } from "express";

import { ApiError } from "../../utils/api-error";
import type { AdminPermissionKey } from "./admin.permissions";
import { resolveAdminAccess } from "./admin-rbac.repository";

export const ADMIN_ACCESS_LOCALS_KEY = "diewishAdminAccess";

/**
 * Fine-grained backend authorization. Required permissions are typed and the
 * effective set is resolved from the database on every request.
 */
export function requireAdminPermission(...required: AdminPermissionKey[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized("Authentication required."));
      return;
    }

    try {
      const access = await resolveAdminAccess(req.user.id);
      if (!access) {
        next(ApiError.forbidden("You do not have permission to access Management Center."));
        return;
      }

      const effective = new Set(access.permissions);
      if (!required.every((permission) => effective.has(permission))) {
        next(ApiError.forbidden("You do not have permission to perform this admin action."));
        return;
      }

      res.locals[ADMIN_ACCESS_LOCALS_KEY] = access;
      next();
    } catch (error) {
      next(error);
    }
  };
}
