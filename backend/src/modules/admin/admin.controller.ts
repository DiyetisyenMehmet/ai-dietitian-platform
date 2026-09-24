import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/api-response";
import { getAdminEnvironmentIdentity } from "./admin.environment";
import { ADMIN_ACCESS_LOCALS_KEY } from "./admin.middleware";
import type { AdminAccessContext } from "./admin-rbac.repository";

function accessFromResponse(res: Response): AdminAccessContext {
  return res.locals[ADMIN_ACCESS_LOCALS_KEY] as AdminAccessContext;
}

export const adminController = {
  session(_req: Request, res: Response) {
    const access = accessFromResponse(res);
    return sendSuccess(res, {
      admin: access.user,
      roles: access.roles,
      permissions: access.permissions,
      environment: getAdminEnvironmentIdentity(),
    });
  },

  environment(_req: Request, res: Response) {
    return sendSuccess(res, getAdminEnvironmentIdentity());
  },
};
