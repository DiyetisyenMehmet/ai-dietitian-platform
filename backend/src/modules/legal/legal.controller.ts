import type { Request, Response } from "express";

import type { AuditContext } from "../../lib/audit";
import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import type { ConsentActionInput, DocumentTypeParam } from "./dto/legal.schemas";
import { legalService } from "./legal.service";

/** Derives best-effort request context for audit records. */
function auditContext(req: Request): AuditContext {
  return {
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: req.ip ?? null,
  };
}

/** Returns the authenticated user id or throws a 401. */
function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

/**
 * HTTP controllers for the legal & consent module (Sprint 15). Document reads
 * are public (needed on signup before authentication); consent state and
 * grant/withdraw actions require a valid access token.
 */
export const legalController = {
  /** Lists all legal documents (metadata only). Public. */
  listDocuments: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, { documents: legalService.listDocuments() });
  }),

  /** Returns a single legal document with its body. Public. */
  getDocument: asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.params as unknown as DocumentTypeParam;
    sendSuccess(res, { document: legalService.getDocument(type) });
  }),

  /** Returns the authenticated user's consent status. */
  getConsents: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    sendSuccess(res, await legalService.getConsentStatus(userId));
  }),

  /** Records an affirmative consent for a document. */
  grantConsent: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { type } = req.body as ConsentActionInput;
    const consent = await legalService.grantConsent(userId, type, auditContext(req));
    sendSuccess(res, { consent });
  }),

  /** Withdraws consent for a document. */
  withdrawConsent: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { type } = req.body as ConsentActionInput;
    const consent = await legalService.withdrawConsent(userId, type, auditContext(req));
    sendSuccess(res, { consent });
  }),
};
