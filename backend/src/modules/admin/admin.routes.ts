import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorize } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { adminAccessController } from "./admin-access.controller";
import {
  adminAccessUserParamsSchema,
  adminStaffUpdateSchema,
} from "./admin-access.schemas";
import { adminGovernanceController } from "./admin-governance.controller";
import {
  adminAuditQuerySchema,
  adminInvitationCreateSchema,
  adminRoleCreateSchema,
  adminRoleParamsSchema,
  adminRoleUpdateSchema,
  adminSessionMutationSchema,
  adminStaffParamsSchema,
  adminStaffSessionParamsSchema,
} from "./admin-governance.schemas";
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
  "/access/staff",
  requireAdminPermission(ADMIN_PERMISSIONS.STAFF_READ),
  adminAccessController.listUsers,
);
adminRouter.get(
  "/access/roles",
  requireAdminPermission(ADMIN_PERMISSIONS.ROLES_READ),
  adminAccessController.listRoles,
);
adminRouter.get(
  "/access/permissions",
  requireAdminPermission(ADMIN_PERMISSIONS.ROLES_READ),
  adminGovernanceController.listPermissions,
);
adminRouter.get(
  "/access/invitations",
  requireAdminPermission(ADMIN_PERMISSIONS.STAFF_READ),
  adminGovernanceController.listInvitations,
);
adminRouter.post(
  "/access/invitations",
  requireAdminPermission(ADMIN_PERMISSIONS.STAFF_MANAGE),
  validate({ body: adminInvitationCreateSchema }),
  adminGovernanceController.inviteStaff,
);
adminRouter.post(
  "/access/roles",
  requireAdminPermission(ADMIN_PERMISSIONS.ROLES_MANAGE),
  validate({ body: adminRoleCreateSchema }),
  adminGovernanceController.createRole,
);
adminRouter.patch(
  "/access/roles/:key",
  requireAdminPermission(ADMIN_PERMISSIONS.ROLES_MANAGE),
  validate({ params: adminRoleParamsSchema, body: adminRoleUpdateSchema }),
  adminGovernanceController.updateRole,
);
adminRouter.patch(
  "/access/staff/:id",
  requireAdminPermission(ADMIN_PERMISSIONS.STAFF_MANAGE),
  validate({ params: adminAccessUserParamsSchema, body: adminStaffUpdateSchema }),
  adminAccessController.updateStaffAccess,
);
adminRouter.get(
  "/access/staff/:id/sessions",
  requireAdminPermission(ADMIN_PERMISSIONS.STAFF_READ),
  validate({ params: adminStaffParamsSchema }),
  adminGovernanceController.listSessions,
);
adminRouter.delete(
  "/access/staff/:id/sessions/:sessionId",
  requireAdminPermission(ADMIN_PERMISSIONS.STAFF_MANAGE),
  validate({ params: adminStaffSessionParamsSchema, body: adminSessionMutationSchema }),
  adminGovernanceController.revokeSession,
);
adminRouter.delete(
  "/access/staff/:id/sessions",
  requireAdminPermission(ADMIN_PERMISSIONS.STAFF_MANAGE),
  validate({ params: adminStaffParamsSchema, body: adminSessionMutationSchema }),
  adminGovernanceController.revokeAllSessions,
);
adminRouter.get(
  "/audit",
  requireAdminPermission(ADMIN_PERMISSIONS.AUDIT_READ),
  validate({ query: adminAuditQuerySchema }),
  adminGovernanceController.audit,
);

adminRouter.get("/session", requireAdminPermission(ADMIN_PERMISSIONS.ACCESS), adminController.session);
adminRouter.get("/environment", requireAdminPermission(ADMIN_PERMISSIONS.ACCESS), adminController.environment);
