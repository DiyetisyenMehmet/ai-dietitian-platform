import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorize } from "../../middleware/authenticate";
import { adminController } from "./admin.controller";
import { requireAdminFoundationEnvironment } from "./admin.environment";
import { requireAdminPermission } from "./admin.middleware";
import { ADMIN_PERMISSIONS } from "./admin.permissions";
import { adminRateLimiter } from "./admin.rate-limit";

export const adminRouter = Router();

adminRouter.use(adminRateLimiter);
adminRouter.use(authenticate);
adminRouter.use(authorize(UserRole.ADMIN));
adminRouter.use(requireAdminFoundationEnvironment);

adminRouter.get(
  "/session",
  requireAdminPermission(ADMIN_PERMISSIONS.ACCESS),
  adminController.session,
);
adminRouter.get(
  "/environment",
  requireAdminPermission(ADMIN_PERMISSIONS.ACCESS),
  adminController.environment,
);
