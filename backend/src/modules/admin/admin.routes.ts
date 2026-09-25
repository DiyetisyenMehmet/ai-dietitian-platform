import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorize } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { adminAccessController } from "./admin-access.controller";
import {
  adminAccessUserParamsSchema,
  adminCreateAccessUserSchema,
  adminUpdateAccessUserSchema,
} from "./admin-access.schemas";
import { adminAuthController } from "./admin-auth.controller";
import {
  adminBootstrapSchema,
  adminEmailChangeSchema,
  adminEmailLoginSchema,
  adminForgotPasswordSchema,
  adminPasswordChangeSchema,
  adminResetPasswordSchema,
} from "./admin-auth.schemas";
import { adminController } from "./admin.controller";
import { requireAdminFoundationEnvironment } from "./admin.environment";
import { requireAdminPermission } from "./admin.middleware";
import { ADMIN_PERMISSIONS } from "./admin.permissions";
import { adminRateLimiter } from "./admin.rate-limit";

export const adminRouter = Router();

adminRouter.use(adminRateLimiter);
adminRouter.use(requireAdminFoundationEnvironment);

adminRouter.post("/auth/login", validate({ body: adminEmailLoginSchema }), adminAuthController.emailLogin);
adminRouter.post("/auth/bootstrap", validate({ body: adminBootstrapSchema }), adminAuthController.bootstrap);
adminRouter.post(
  "/auth/password/forgot",
  validate({ body: adminForgotPasswordSchema }),
  adminAuthController.forgotPassword,
);
adminRouter.post(
  "/auth/password/reset",
  validate({ body: adminResetPasswordSchema }),
  adminAuthController.resetPassword,
);

adminRouter.use(authenticate);
adminRouter.use(authorize(UserRole.ADMIN));

adminRouter.patch(
  "/account/email",
  requireAdminPermission(ADMIN_PERMISSIONS.ACCESS),
  validate({ body: adminEmailChangeSchema }),
  adminAuthController.changeEmail,
);
adminRouter.patch(
  "/account/password",
  requireAdminPermission(ADMIN_PERMISSIONS.ACCESS),
  validate({ body: adminPasswordChangeSchema }),
  adminAuthController.changePassword,
);

adminRouter.get(
  "/access/users",
  requireAdminPermission(ADMIN_PERMISSIONS.ACCESS_MANAGE),
  adminAccessController.listUsers,
);
adminRouter.post(
  "/access/users",
  requireAdminPermission(ADMIN_PERMISSIONS.ACCESS_MANAGE),
  validate({ body: adminCreateAccessUserSchema }),
  adminAccessController.createUser,
);
adminRouter.patch(
  "/access/users/:id",
  requireAdminPermission(ADMIN_PERMISSIONS.ACCESS_MANAGE),
  validate({ params: adminAccessUserParamsSchema, body: adminUpdateAccessUserSchema }),
  adminAccessController.updateUserAccess,
);
adminRouter.get(
  "/audit",
  requireAdminPermission(ADMIN_PERMISSIONS.AUDIT_READ),
  adminAccessController.audit,
);

adminRouter.get("/session", requireAdminPermission(ADMIN_PERMISSIONS.ACCESS), adminController.session);
adminRouter.get("/environment", requireAdminPermission(ADMIN_PERMISSIONS.ACCESS), adminController.environment);
