import crypto from "node:crypto";
import path from "node:path";
import type { Readable } from "node:stream";

import type { BloodTestUpload } from "@prisma/client";

import { env } from "../../config/env";
import { recordAudit, type AuditContext } from "../../lib/audit";
import { logger } from "../../lib/logger";
import { getStorageProvider, type StoredObjectRef } from "../../lib/storage";
import { ApiError } from "../../utils/api-error";
import {
  detectAllowedMimeType,
  MIME_EXTENSION,
  ALLOWED_TYPES_LABEL,
  type AllowedMimeType,
} from "./blood-test.file-types";
import { bloodTestRepository } from "./blood-test.repository";
import type { UploadMetadataInput } from "./blood-test.schemas";

export interface IncomingFile {
  buffer: Buffer;
  originalName: string;
  size: number;
}

export interface PublicBloodTestUpload {
  id: string;
  status: BloodTestUpload["status"];
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  label: string | null;
  testDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicBloodTestPage {
  items: PublicBloodTestUpload[];
  nextCursor: string | null;
}

const maxFileBytes = env.BLOOD_TEST_MAX_FILE_SIZE_MB * 1024 * 1024;

function toPublic(row: BloodTestUpload): PublicBloodTestUpload {
  return {
    id: row.id,
    status: row.status,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    checksumSha256: row.checksumSha256,
    label: row.label,
    testDate: row.testDate ? row.testDate.toISOString().slice(0, 10) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function namespaceFor(userId: string): string {
  return `blood-tests/${userId}`;
}

function refFor(userId: string, storageKey: string): StoredObjectRef {
  return { namespace: namespaceFor(userId), key: storageKey };
}

/**
 * Converts the untrusted client filename into display-only metadata. The final
 * extension always follows the detected content type, so a valid PDF uploaded
 * as `report.exe` can never be served back with a misleading executable name.
 */
function sanitizeFilename(name: string, mime: AllowedMimeType): string {
  const normalized = (name || "").replace(/\\/g, "/");
  const base = path.basename(normalized);
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  const lastDot = cleaned.lastIndexOf(".");
  const rawStem = lastDot > 0 ? cleaned.slice(0, lastDot) : cleaned;
  const stem = rawStem.replace(/[. ]+$/g, "").trim() || "blood-test";
  const extension = MIME_EXTENSION[mime];
  const maxStemLength = Math.max(1, 200 - extension.length - 1);
  return `${stem.slice(0, maxStemLength)}.${extension}`;
}

function validateAndDescribe(file: IncomingFile): {
  mime: AllowedMimeType;
  storageKey: string;
  checksum: string;
  size: number;
} {
  if (!file.buffer || file.buffer.length === 0) {
    throw ApiError.badRequest("The uploaded file is empty.");
  }
  if (file.buffer.length > maxFileBytes) {
    throw ApiError.badRequest(
      `File is too large. Maximum size is ${env.BLOOD_TEST_MAX_FILE_SIZE_MB} MB.`,
    );
  }

  const mime = detectAllowedMimeType(file.buffer);
  if (!mime) {
    throw ApiError.badRequest(
      `Unsupported or corrupt file. Allowed types: ${ALLOWED_TYPES_LABEL}.`,
    );
  }

  const storageKey = `${crypto.randomUUID()}.${MIME_EXTENSION[mime]}`;
  const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
  return { mime, storageKey, checksum, size: file.buffer.length };
}

export const bloodTestService = {
  async upload(
    userId: string,
    file: IncomingFile,
    metadata: UploadMetadataInput,
    context: AuditContext,
  ): Promise<PublicBloodTestUpload> {
    const { mime, storageKey, checksum, size } = validateAndDescribe(file);
    const storage = getStorageProvider();

    await storage.put({
      namespace: namespaceFor(userId),
      key: storageKey,
      body: file.buffer,
      contentType: mime,
    });

    let created: BloodTestUpload;
    try {
      created = await bloodTestRepository.create({
        userId,
        storageProvider: storage.name,
        storageKey,
        originalFilename: sanitizeFilename(file.originalName, mime),
        mimeType: mime,
        fileSizeBytes: size,
        checksumSha256: checksum,
        label: metadata.label ?? null,
        testDate: metadata.testDate ? new Date(`${metadata.testDate}T00:00:00.000Z`) : null,
      });
    } catch (error) {
      await storage.delete(refFor(userId, storageKey)).catch(() => undefined);
      throw error;
    }

    await recordAudit({
      action: "BLOOD_TEST_UPLOADED",
      userId,
      context,
      metadata: { uploadId: created.id, mimeType: mime, fileSizeBytes: size },
    });
    return toPublic(created);
  },

  async list(userId: string, limit: number, cursor?: string): Promise<PublicBloodTestPage> {
    if (cursor) {
      const cursorRow = await bloodTestRepository.findByIdForUser(cursor, userId);
      if (!cursorRow) {
        throw ApiError.badRequest("Invalid blood-test history cursor.");
      }
    }

    const rows = await bloodTestRepository.listByUser(userId, limit, cursor);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: pageRows.map(toPublic),
      nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null,
    };
  },

  async getById(userId: string, id: string): Promise<PublicBloodTestUpload> {
    const row = await bloodTestRepository.findByIdForUser(id, userId);
    if (!row) {
      throw ApiError.notFound("Blood test upload not found.");
    }
    return toPublic(row);
  },

  async getFile(
    userId: string,
    id: string,
  ): Promise<{ row: BloodTestUpload; stream: Readable }> {
    const row = await bloodTestRepository.findByIdForUser(id, userId);
    if (!row) {
      throw ApiError.notFound("Blood test upload not found.");
    }
    const { stream } = await getStorageProvider().get(refFor(userId, row.storageKey));
    return { row, stream };
  },

  async replaceFile(
    userId: string,
    id: string,
    file: IncomingFile,
    context: AuditContext,
  ): Promise<PublicBloodTestUpload> {
    const existing = await bloodTestRepository.findByIdForUser(id, userId);
    if (!existing) {
      throw ApiError.notFound("Blood test upload not found.");
    }

    const { mime, storageKey, checksum, size } = validateAndDescribe(file);
    const storage = getStorageProvider();

    await storage.put({
      namespace: namespaceFor(userId),
      key: storageKey,
      body: file.buffer,
      contentType: mime,
    });

    let updatedCount = 0;
    try {
      const updateResult = await bloodTestRepository.updateFile(id, userId, {
        storageProvider: storage.name,
        storageKey,
        originalFilename: sanitizeFilename(file.originalName, mime),
        mimeType: mime,
        fileSizeBytes: size,
        checksumSha256: checksum,
      });
      updatedCount = updateResult.count;
    } catch (error) {
      await storage.delete(refFor(userId, storageKey)).catch(() => undefined);
      throw error;
    }

    if (updatedCount !== 1) {
      await storage.delete(refFor(userId, storageKey)).catch(() => undefined);
      throw ApiError.notFound("Blood test upload not found.");
    }

    if (existing.storageKey !== storageKey) {
      await storage.delete(refFor(userId, existing.storageKey)).catch((err) => {
        logger.warn(
          { err, uploadId: id, staleKey: existing.storageKey },
          "Failed to remove superseded blood-test object",
        );
      });
    }

    await recordAudit({
      action: "BLOOD_TEST_REPLACED",
      userId,
      context,
      metadata: { uploadId: id, mimeType: mime, fileSizeBytes: size },
    });

    const updated = await bloodTestRepository.findByIdForUser(id, userId);
    if (!updated) {
      throw ApiError.notFound("Blood test upload not found.");
    }
    return toPublic(updated);
  },

  async remove(userId: string, id: string, context: AuditContext): Promise<void> {
    const existing = await bloodTestRepository.findByIdForUser(id, userId);
    if (!existing) {
      throw ApiError.notFound("Blood test upload not found.");
    }

    const result = await bloodTestRepository.deleteForUser(id, userId);
    if (result.count === 0) {
      throw ApiError.notFound("Blood test upload not found.");
    }

    await getStorageProvider()
      .delete(refFor(userId, existing.storageKey))
      .catch((err) => {
        logger.warn(
          { err, uploadId: id, storageKey: existing.storageKey },
          "Failed to remove blood-test object after record deletion",
        );
      });

    await recordAudit({
      action: "BLOOD_TEST_DELETED",
      userId,
      context,
      metadata: { uploadId: id },
    });
  },
};
