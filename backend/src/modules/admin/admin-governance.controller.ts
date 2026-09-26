import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type {
  AdminAuditQueryInput,
  AdminInvitationCreateInput,
  AdminRoleCreateInput,
  AdminRoleUpdateInput,
  AdminSessionMutationInput,
} from "./admin-governance.schemas";
import { adminGovernanceService } from "./admin-governance.service";

function requireAdminId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

function requestIdentity(req: Request) {
  const requestId = String(req.id);
  return { correlationId: requestId, requestId };
}

export const adminGovernanceController = {
  listInvitations: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, { invitations: await adminGovernanceService.listInvitations() });
  }),

  inviteStaff: asyncHandler(async (req: Request, res: Response) => {
    const invitation = await adminGovernanceService.inviteStaff(
      requireAdminId(req),
      req.body as AdminInvitationCreateInput,
      requestIdentity(req),
    );
    sendCreated(res, { invitation });
  }),

  listPermissions: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, { permissions: await adminGovernanceService.listPermissions() });
  }),

  createRole: asyncHandler(async (req: Request, res: Response) => {
    const role = await adminGovernanceService.createCustomRole(
      requireAdminId(req),
      req.body as AdminRoleCreateInput,
      requestIdentity(req),
    );
    sendCreated(res, { role });
  }),

  updateRole: asyncHandler(async (req: Request, res: Response) => {
    const role = await adminGovernanceService.updateCustomRole(
      requireAdminId(req),
      req.params.key!,
      req.body as AdminRoleUpdateInput,
      requestIdentity(req),
    );
    sendSuccess(res, { role });
  }),

  listSessions: asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, {
      sessions: await adminGovernanceService.listStaffSessions(req.params.id!),
    });
  }),

  revokeSession: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as AdminSessionMutationInput;
    sendSuccess(res, await adminGovernanceService.revokeStaffSession(
      requireAdminId(req),
      req.params.id!,
      req.params.sessionId!,
      body.reason,
      requestIdentity(req),
    ));
  }),

  revokeAllSessions: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as AdminSessionMutationInput;
    sendSuccess(res, await adminGovernanceService.revokeAllStaffSessions(
      requireAdminId(req),
      req.params.id!,
      body.reason,
      requestIdentity(req),
    ));
  }),

  audit: asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, {
      events: await adminGovernanceService.listAudit(
        req.query as unknown as AdminAuditQueryInput,
      ),
    });
  }),
};
