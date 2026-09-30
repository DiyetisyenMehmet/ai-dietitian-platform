import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type { AdminUsersQuery } from "./admin-users.schemas";
import { adminUsersService } from "./admin-users.service";

import { adminUserOperationsService } from "./admin-user-operations.service";
import { adminUserSubscriptionService } from "./admin-user-subscription.service";
import { adminEntitlementOperationsService } from "./admin-entitlement-operations.service";

export const adminUsersController = {
  upsertSupportEntitlement: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(
      res,
      await adminEntitlementOperationsService.upsert(
        { actorAdminId: req.user!.id, requestId: String(req.id) },
        req.params.id!,
        {
          tier: req.body.tier,
          expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
          expectedUpdatedAt: req.body.expectedUpdatedAt,
          reason: req.body.reason,
        },
      ),
    );
  }),
  revokeSupportEntitlement: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(
      res,
      await adminEntitlementOperationsService.revoke(
        { actorAdminId: req.user!.id, requestId: String(req.id) },
        req.params.id!,
        req.body.expectedUpdatedAt,
        req.body.reason,
      ),
    );
  }),
  subscription: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, await adminUserSubscriptionService.detail(req.params.id!));
  }),
  sessions: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, await adminUserOperationsService.sessions(req.params.id!));
  }),
  status: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(
      res,
      await adminUserOperationsService.status(
        { actorAdminId: req.user!.id, requestId: String(req.id) },
        req.params.id!,
        req.body.isActive,
        req.body.reason,
      ),
    );
  }),
  revoke: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(
      res,
      await adminUserOperationsService.revoke(
        { actorAdminId: req.user!.id, requestId: String(req.id) },
        req.params.id!,
        req.params.sessionId!,
        req.body.reason,
      ),
    );
  }),
  revokeAll: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(
      res,
      await adminUserOperationsService.revokeAll(
        { actorAdminId: req.user!.id, requestId: String(req.id) },
        req.params.id!,
        req.body.reason,
      ),
    );
  }),
  list: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, await adminUsersService.list(req.query as unknown as AdminUsersQuery));
  }),
  detail: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, await adminUsersService.detail(req.params.id!));
  }),
};
