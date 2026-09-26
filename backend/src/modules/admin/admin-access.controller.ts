import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type {
  AdminCreateAccessUserInput,
  AdminUpdateAccessUserInput,
  AdminStaffUpdateInput,
} from "./admin-access.schemas";
import { adminAccessService } from "./admin-access.service";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

function requestIdentity(req: Request) {
  const requestId = String(req.id);
  return { correlationId: requestId, requestId };
}

export const adminAccessController = {
  listUsers: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, { users: await adminAccessService.listAdmins() });
  }),

  listRoles: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, { roles: await adminAccessService.listRoles() });
  }),

  updateStaffAccess: asyncHandler(async (req: Request, res: Response) => {
    const user = await adminAccessService.updateStaffAccess(
      requireUserId(req),
      req.params.id!,
      req.body as AdminStaffUpdateInput,
      requestIdentity(req),
    );
    sendSuccess(res, { user });
  }),

  createUser: asyncHandler(async (req: Request, res: Response) => {
    const user = await adminAccessService.createAdmin(
      requireUserId(req),
      req.body as AdminCreateAccessUserInput,
      requestIdentity(req),
    );
    sendCreated(res, { user });
  }),

  updateUserAccess: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as AdminUpdateAccessUserInput;
    const user = await adminAccessService.updateAccess(
      requireUserId(req),
      req.params.id!,
      input,
      requestIdentity(req),
    );
    sendSuccess(res, { user });
  }),

  audit: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, { events: await adminAccessService.listAudit() });
  }),
};
