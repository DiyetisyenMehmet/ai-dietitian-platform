import { pipeline } from "node:stream/promises";

import type { Request, Response } from "express";

import type { AuditContext } from "../../lib/audit";
import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { bloodTestService, type IncomingFile } from "./blood-test.service";
import type {
  ListBloodTestsQuery,
  UploadIdParam,
  UploadMetadataInput,
} from "./blood-test.schemas";

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

function requireFile(req: Request): IncomingFile {
  const file = req.file;
  if (!file || !file.buffer) {
    throw ApiError.badRequest('A file is required in the "file" field.');
  }
  return { buffer: file.buffer, originalName: file.originalname, size: file.size };
}

function safeAsciiFilename(filename: string): string {
  const ascii = filename
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\\r\n]/g, "_")
    .trim();
  return ascii || "blood-test-file";
}

function encodeRfc5987(filename: string): string {
  return encodeURIComponent(filename).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function contentDisposition(filename: string): string {
  return `inline; filename="${safeAsciiFilename(filename)}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
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
    const { limit, cursor } = req.query as unknown as ListBloodTestsQuery;
    const page = await bloodTestService.list(userId, limit, cursor);
    sendSuccess(res, page);
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
    res.setHeader("Content-Length", String(row.fileSizeBytes));
    res.setHeader("Content-Disposition", contentDisposition(row.originalFilename));

    const abortSource = () => stream.destroy();
    req.once("aborted", abortSource);
    try {
      await pipeline(stream, res);
    } catch (error) {
      if (req.aborted || res.destroyed) return;
      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : undefined);
        return;
      }
      throw error;
    } finally {
      req.off("aborted", abortSource);
    }
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
