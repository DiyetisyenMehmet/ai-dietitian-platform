import type { Request, Response } from "express";

import type { AuditContext } from "../../lib/audit";
import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { bloodTestService, type IncomingFile } from "./blood-test.service";
import type { UploadIdParam, UploadMetadataInput } from "./blood-test.schemas";

function auditContext(req: Request): AuditContext {
  return {
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: req.ip ?? null,
  };
}

function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

/** Normalizes the multer file into the service's IncomingFile, or 400. */
function requireFile(req: Request): IncomingFile {
  const file = req.file;
  if (!file || !file.buffer) {
    throw ApiError.badRequest('A file is required in the "file" field.');
  }
  return { buffer: file.buffer, originalName: file.originalname, size: file.size };
}

export const bloodTestController = {
  upload: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const file = requireFile(req);
    const metadata = req.body as UploadMetadataInput;
    const result = await bloodTestService.upload(userId, file, metadata, auditContext(req));
    sendCreated(res, { upload: result });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const uploads = await bloodTestService.list(userId);
    sendSuccess(res, { uploads });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as UploadIdParam;
    const upload = await bloodTestService.getById(userId, id);
    sendSuccess(res, { upload });
  }),

  download: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as UploadIdParam;
    const { row, stream } = await bloodTestService.getFile(userId, id);

    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Length", row.fileSizeBytes);
    // `inline` lets browsers preview PDFs/images; the filename is used on save.
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(row.originalFilename)}"`,
    );
    stream.pipe(res);
  }),

  replace: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as UploadIdParam;
    const file = requireFile(req);
    const result = await bloodTestService.replaceFile(userId, id, file, auditContext(req));
    sendSuccess(res, { upload: result });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as UploadIdParam;
    await bloodTestService.remove(userId, id, auditContext(req));
    sendSuccess(res, { message: "Blood test upload deleted." });
  }),
};
