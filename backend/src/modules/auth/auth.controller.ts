import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { authService, type SessionContext } from "./auth.service";
import type { LoginInput, LogoutInput, RefreshInput, RegisterInput } from "./auth.schemas";

/** Derives best-effort session metadata from the request for auditing. */
function sessionContext(req: Request): SessionContext {
  return {
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: req.ip ?? null,
  };
}

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as RegisterInput;
    const result = await authService.register(input, sessionContext(req));
    sendCreated(res, result);
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as LoginInput;
    const result = await authService.login(input, sessionContext(req));
    sendSuccess(res, result);
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshInput;
    const result = await authService.refresh(refreshToken, sessionContext(req));
    sendSuccess(res, result);
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as LogoutInput;
    await authService.logout(refreshToken);
    sendSuccess(res, { message: "Logged out successfully." });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized("Authentication required.");
    }
    const user = await authService.getCurrentUser(req.user.id);
    sendSuccess(res, { user });
  }),
};
