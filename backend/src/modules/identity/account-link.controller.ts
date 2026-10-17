import type { Request, Response } from "express";
import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { accountLinkService } from "./account-link.service";
import type { z } from "zod";
import type {
  accountLinkStartSchema,
  accountLinkCompleteSchema,
  googleTransitionStartSchema,
  googleTransitionCompleteSchema,
} from "./account-link.schemas";

function principal(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return {
    userId: req.user.id,
    sessionToken: req.headers.authorization!.slice("Bearer ".length).trim(),
  };
}
function headers(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}
export const accountLinkController = {
  start: asyncHandler(async (req: Request, res: Response) => {
    headers(res);
    const { userId, sessionToken } = principal(req);
    sendSuccess(
      res,
      await accountLinkService.start(
        userId,
        sessionToken,
        req.body as z.infer<typeof accountLinkStartSchema>,
      ),
    );
  }),
  complete: asyncHandler(async (req: Request, res: Response) => {
    headers(res);
    const { userId, sessionToken } = principal(req);
    sendSuccess(
      res,
      await accountLinkService.complete(
        userId,
        sessionToken,
        req.body as z.infer<typeof accountLinkCompleteSchema>,
      ),
    );
  }),
  startGoogleTransition: asyncHandler(async (req: Request, res: Response) => {
    headers(res);
    const { idToken } = req.body as z.infer<typeof googleTransitionStartSchema>;
    sendSuccess(res, await accountLinkService.startGoogleTransition(idToken));
  }),
  completeGoogleTransition: asyncHandler(async (req: Request, res: Response) => {
    headers(res);
    const result = await accountLinkService.completeGoogleTransition(
      req.body as z.infer<typeof googleTransitionCompleteSchema>,
      { userAgent: req.headers["user-agent"] ?? null, ipAddress: req.ip ?? null },
    );
    // Reuse the existing identity controller's refresh-cookie contract.
    const { writeIdentityRefreshCookie } = await import("./identity.controller");
    writeIdentityRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, { user: result.user, tokens: result.tokens });
  }),
};
