import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorize } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { adminAuthController } from "./admin-auth.controller";
import { adminEmailLoginSchema, adminPhoneLoginSchema } from "./admin-auth.schemas";
import { adminController } from "./admin.controller";
import { requireAdminFoundationEnvironment } from "./admin.environment";
import { requireAdminPermission } from "./admin.middleware";
import { ADMIN_PERMISSIONS } from "./admin.permissions";
import { adminRateLimiter } from "./admin.rate-limit";

export const adminRouter = Router();

adminRouter.use(adminRateLimiter);
adminRouter.use(requireAdminFoundationEnvironment);

adminRouter.post(
  "/auth/login",
  validate({ body: adminEmailLoginSchema }),
  adminAuthController.emailLogin,
);
adminRouter.post(
  "/auth/phone",
  validate({ body: adminPhoneLoginSchema }),
  adminAuthController.phoneLogin,
);

adminRouter.use(authenticate);
adminRouter.use(authorize(UserRole.ADMIN));

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
