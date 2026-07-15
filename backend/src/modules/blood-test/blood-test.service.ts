import crypto from "node:crypto";
import path from "node:path";

import type { BloodTestUpload } from "@prisma/client";

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

/** A file received from the upload middleware, normalized for the service. */
export interface IncomingFile {
  buffer: Buffer;
  originalName: string;
  size: number;
}

/** Public-safe representation of an upload (internal storage refs omitted). */
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

/** Per-user storage namespace so objects are grouped and easy to scope. */
function namespaceFor(userId: string): string {
  return `blood-tests/${userId}`;
}

function refFor(userId: string, storageKey: string): StoredObjectRef {
  return { namespace: namespaceFor(userId), key: storageKey };
}

/**
 * Produces a safe display filename: strips any directory component, removes
 * control/reserved characters, and bounds the length. Never used as a storage
 * key (those are random), only for display/download.
 */
function sanitizeFilename(name: string, mime: AllowedMimeType): string {
  const base = path.basename(name || "").replace(/[/\\]/g, "");
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  const fallback = `blood-test.${MIME_EXTENSION[mime]}`;
  const safe = cleaned.length > 0 ? cleaned : fallback;
  return safe.length > 200 ? safe.slice(-200) : safe;
}

/**
 * Validates the true content type and returns the sniffed mime plus a freshly
 * generated storage key. Rejects anything not in the allowed set regardless of
 * the client-declared type.
 */
function validateAndDescribe(file: IncomingFile): {
  mime: AllowedMimeType;
  storageKey: string;
  checksum: string;
} {
  if (!file.buffer || file.buffer.length === 0) {
    throw ApiError.badRequest("The uploaded file is empty.");
  }
  const mime = detectAllowedMimeType(file.buffer);
  if (!mime) {
    throw ApiError.badRequest(
      `Unsupported or corrupt file. Allowed types: ${ALLOWED_TYPES_LABEL}.`,
    );
  }
  const storageKey = `${crypto.randomUUID()}.${MIME_EXTENSION[mime]}`;
  const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
  return { mime, storageKey, checksum };
}

export const bloodTestService = {
  /** Stores a new blood-test file and its metadata for the user. */
  async upload(
    userId: string,
    file: IncomingFile,
    metadata: UploadMetadataInput,
    context: AuditContext,
  ): Promise<PublicBloodTestUpload> {
    const { mime, storageKey, checksum } = validateAndDescribe(file);
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
        fileSizeBytes: file.size,
        checksumSha256: checksum,
        label: metadata.label ?? null,
        testDate: metadata.testDate ? new Date(`${metadata.testDate}T00:00:00.000Z`) : null,
      });
    } catch (error) {
      // Roll back the orphaned object if the metadata insert fails.
      await storage.delete(refFor(userId, storageKey)).catch(() => undefined);
      throw error;
    }

    await recordAudit({
      action: "BLOOD_TEST_UPLOADED",
      userId,
      context,
      metadata: { uploadId: created.id, mimeType: mime, fileSizeBytes: file.size },
    });
    return toPublic(created);
  },

  /** Returns the user's upload history (newest first). */
  async list(userId: string): Promise<PublicBloodTestUpload[]> {
    const rows = await bloodTestRepository.listByUser(userId);
    return rows.map(toPublic);
  },

  /** Returns a single upload's metadata, or 404 if not owned/found. */
  async getById(userId: string, id: string): Promise<PublicBloodTestUpload> {
    const row = await bloodTestRepository.findByIdForUser(id, userId);
    if (!row) {
      throw ApiError.notFound("Blood test upload not found.");
    }
    return toPublic(row);
  },

  /**
   * Opens the stored file for download/streaming. Returns the stream plus the
   * metadata needed to set response headers. 404 if not owned/found.
   */
  async getFile(
    userId: string,
    id: string,
  ): Promise<{ row: BloodTestUpload; stream: NodeJS.ReadableStream }> {
    const row = await bloodTestRepository.findByIdForUser(id, userId);
    if (!row) {
      throw ApiError.notFound("Blood test upload not found.");
    }
    const { stream } = await getStorageProvider().get(refFor(userId, row.storageKey));
    return { row, stream };
  },

  /**
   * Replaces the file of an existing upload. The new object is written first,
   * the record repointed, and the old object removed afterwards (best-effort),
   * so a failure never leaves the record pointing at missing bytes. Status is
   * reset to `UPLOADED` since any prior downstream processing is now stale.
   */
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

    const { mime, storageKey, checksum } = validateAndDescribe(file);
    const storage = getStorageProvider();

    await storage.put({
      namespace: namespaceFor(userId),
      key: storageKey,
      body: file.buffer,
      contentType: mime,
    });

    try {
      await bloodTestRepository.updateFile(id, userId, {
        storageProvider: storage.name,
        storageKey,
        originalFilename: sanitizeFilename(file.originalName, mime),
        mimeType: mime,
        fileSizeBytes: file.size,
        checksumSha256: checksum,
      });
    } catch (error) {
      await storage.delete(refFor(userId, storageKey)).catch(() => undefined);
      throw error;
    }

    // Remove the superseded object; failure is non-fatal (a stray blob at worst).
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
      metadata: { uploadId: id, mimeType: mime, fileSizeBytes: file.size },
    });

    const updated = await bloodTestRepository.findByIdForUser(id, userId);
    // Non-null: the record was just updated within this request.
    return toPublic(updated as BloodTestUpload);
  },

  /** Deletes an upload's record and its stored object (best-effort). */
  async remove(userId: string, id: string, context: AuditContext): Promise<void> {
    const existing = await bloodTestRepository.findByIdForUser(id, userId);
    if (!existing) {
      throw ApiError.notFound("Blood test upload not found.");
    }

    const result = await bloodTestRepository.deleteForUser(id, userId);
    if (result.count === 0) {
      // Raced with another delete — treat as not found.
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
