import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type { AdminUsersQuery } from "./admin-users.schemas";
import { adminUsersService } from "./admin-users.service";

export const adminUsersController = {
  list: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, await adminUsersService.list(req.query as unknown as AdminUsersQuery));
  }),
  detail: asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, await adminUsersService.detail(req.params.id!));
  }),
};
