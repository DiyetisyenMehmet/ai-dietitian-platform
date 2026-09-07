import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { env } from "../config/env";
import { logger } from "./logger";

const GCS_METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const GCS_JSON_API = "https://storage.googleapis.com/storage/v1";
const GCS_UPLOAD_API = "https://storage.googleapis.com/upload/storage/v1";

/**
 * Storage abstraction for Diewish.
 *
 * The binary payload of user documents (e.g. blood-test PDFs/images) is never
 * kept in the database — it lives in a pluggable storage backend referenced by
 * a `{ namespace, key }` pair. Provider names are persisted with every row so a
 * storage migration never silently redirects historical reads or deletes.
 */

/** A stable reference to a stored object within a backend. */
export interface StoredObjectRef {
  /** Logical grouping/prefix (e.g. `blood-tests/<userId>`). */
  namespace: string;
  /** Opaque object key/filename within the namespace. */
  key: string;
}

/** Input for writing an object to storage. */
export interface PutObjectInput extends StoredObjectRef {
  body: Buffer;
  contentType: string;
}

/** Result of reading an object. */
export interface GetObjectResult {
  stream: NodeJS.ReadableStream;
  contentType?: string;
  sizeBytes?: number;
}

/** Provider-agnostic storage contract. */
export interface StorageProvider {
  /** Short backend identifier persisted alongside the object reference. */
  readonly name: string;
  /** Writes a new object. Providers must not silently overwrite existing data. */
  put(input: PutObjectInput): Promise<StoredObjectRef>;
  /** Opens an object for reads. */
  get(ref: StoredObjectRef): Promise<GetObjectResult>;
  /** Reads the full object into memory as a Buffer. */
  getBuffer(ref: StoredObjectRef): Promise<Buffer>;
  /** Removes an object (idempotent — a missing object is not an error). */
  delete(ref: StoredObjectRef): Promise<void>;
}

export type StorageErrorCode = "INVALID_REF" | "NOT_FOUND" | "CONFLICT" | "IO_ERROR";

/** Sanitized storage-layer error; never includes an absolute filesystem path. */
export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StorageError";
  }
}

/**
 * Sanitizes a GCS object-name segment. GCS object names cannot escape a local
 * filesystem root, but we still keep object names conservative and predictable.
 */
function safeSegment(segment: string): string {
  return segment
    .split(/[/\\]+/)
    .map((part) => part.replace(/\.\.+/g, "").replace(/[^A-Za-z0-9._-]/g, ""))
    .filter((part) => part.length > 0)
    .join("/");
}

/** Local-disk storage backend rooted at `STORAGE_LOCAL_ROOT`. */
export class LocalStorageProvider implements StorageProvider {
  public readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /**
   * Reject unsafe refs rather than rewriting them. Rewriting traversal or an
   * absolute path into a different valid key can create aliasing and overwrite
   * surprises; a storage reference must resolve exactly as supplied.
   */
  private safeSegments(value: string, label: "namespace" | "key"): string[] {
    const trimmed = value.trim();
    if (
      !trimmed ||
      trimmed.includes("\0") ||
      path.isAbsolute(trimmed) ||
      path.win32.isAbsolute(trimmed)
    ) {
      throw new StorageError("INVALID_REF", `Invalid storage ${label}.`);
    }

    const segments = trimmed.replace(/\\/g, "/").split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new StorageError("INVALID_REF", `Invalid storage ${label}.`);
    }
    return segments;
  }

  private resolvePath(ref: StoredObjectRef): string {
    const target = path.resolve(
      this.root,
      ...this.safeSegments(ref.namespace, "namespace"),
      ...this.safeSegments(ref.key, "key"),
    );
    const rootPrefix = `${this.root}${path.sep}`;
    if (target !== this.root && !target.startsWith(rootPrefix)) {
      throw new StorageError("INVALID_REF", "Invalid storage object reference.");
    }
    return target;
  }

  async put(input: PutObjectInput): Promise<StoredObjectRef> {
    const target = this.resolvePath(input);
    const directory = path.dirname(target);
    await mkdir(directory, { recursive: true });

    // Write beside the destination, then atomically claim the final name with a
    // hard link. `link` fails with EEXIST, so concurrent writes never silently
    // overwrite health-document bytes.
    const temp = path.join(directory, `.tmp-${crypto.randomUUID()}`);
    try {
      await writeFile(temp, input.body, { flag: "wx" });
      await link(temp, target);
      await unlink(temp);
      return { namespace: input.namespace, key: input.key };
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        throw new StorageError("CONFLICT", "Storage object already exists.", { cause: error });
      }
      throw new StorageError("IO_ERROR", "Unable to store object.", { cause: error });
    }
  }

  async get(ref: StoredObjectRef): Promise<GetObjectResult> {
    const target = this.resolvePath(ref);
    try {
      const info = await stat(target);
      if (!info.isFile()) {
        throw new StorageError("NOT_FOUND", "Storage object not found.");
      }
      return { stream: createReadStream(target), sizeBytes: info.size };
    } catch (error) {
      if (error instanceof StorageError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new StorageError("NOT_FOUND", "Storage object not found.");
      }
      throw new StorageError("IO_ERROR", "Unable to read storage object.", { cause: error });
    }
  }

  async getBuffer(ref: StoredObjectRef): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const { stream } = await this.get(ref);
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
  }

  async delete(ref: StoredObjectRef): Promise<void> {
    const target = this.resolvePath(ref);
    try {
      await unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new StorageError("IO_ERROR", "Unable to delete storage object.", { cause: error });
    }
  }
}

interface MetadataAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
}

let gcsAccessTokenCache: { token: string; expiresAtMs: number } | null = null;

/**
 * Fetches an OAuth access token from the Google Cloud metadata server. Cloud
 * Run supplies this automatically from the service identity, so no service
 * account private key or GOOGLE_APPLICATION_CREDENTIALS file belongs in the
 * application/container. The runtime service account must have only the bucket
 * permissions Diewish needs.
 */
async function getGoogleCloudAccessToken(): Promise<string> {
  const now = Date.now();
  if (gcsAccessTokenCache && gcsAccessTokenCache.expiresAtMs > now + 60_000) {
    return gcsAccessTokenCache.token;
  }

  let response: Response;
  try {
    response = await fetch(GCS_METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    logger.error({ err: error }, "Could not reach Google Cloud metadata server for storage authentication");
    throw new Error("Google Cloud Storage authentication is unavailable.");
  }

  if (!response.ok) {
    logger.error({ status: response.status }, "Google Cloud metadata server rejected storage authentication");
    throw new Error("Google Cloud Storage authentication failed.");
  }

  const payload = (await response.json()) as MetadataAccessTokenResponse;
  if (!payload.access_token) {
    throw new Error("Google Cloud metadata server returned no access token.");
  }

  gcsAccessTokenCache = {
    token: payload.access_token,
    expiresAtMs: now + Math.max(60, payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

/** Durable private Google Cloud Storage backend for Cloud Run production. */
class GoogleCloudStorageProvider implements StorageProvider {
  public readonly name = "gcs";
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(bucket: string, prefix: string) {
    if (!bucket.trim()) {
      throw new Error("STORAGE_GCS_BUCKET is required when STORAGE_PROVIDER=gcs.");
    }
    this.bucket = bucket.trim();
    this.prefix = safeSegment(prefix);
  }

  private objectName(ref: StoredObjectRef): string {
    const parts = [this.prefix, safeSegment(ref.namespace), safeSegment(ref.key)].filter(Boolean);
    return parts.join("/");
  }

  private mediaUrl(ref: StoredObjectRef): string {
    const object = encodeURIComponent(this.objectName(ref));
    return `${GCS_JSON_API}/b/${encodeURIComponent(this.bucket)}/o/${object}?alt=media`;
  }

  async put(input: PutObjectInput): Promise<StoredObjectRef> {
    const token = await getGoogleCloudAccessToken();
    const url = new URL(`${GCS_UPLOAD_API}/b/${encodeURIComponent(this.bucket)}/o`);
    url.searchParams.set("uploadType", "media");
    url.searchParams.set("name", this.objectName(input));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": input.contentType,
      },
      body: input.body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      logger.error({ status: response.status }, "Google Cloud Storage object upload failed");
      throw new Error("Health document could not be stored safely.");
    }
    return { namespace: input.namespace, key: input.key };
  }

  async get(ref: StoredObjectRef): Promise<GetObjectResult> {
    const buffer = await this.getBuffer(ref);
    return { stream: Readable.from(buffer), sizeBytes: buffer.length };
  }

  async getBuffer(ref: StoredObjectRef): Promise<Buffer> {
    const token = await getGoogleCloudAccessToken();
    const response = await fetch(this.mediaUrl(ref), {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) {
      throw new Error("Stored health document was not found.");
    }
    if (!response.ok) {
      logger.error({ status: response.status }, "Google Cloud Storage object read failed");
      throw new Error("Health document could not be read from storage.");
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(ref: StoredObjectRef): Promise<void> {
    const token = await getGoogleCloudAccessToken();
    const object = encodeURIComponent(this.objectName(ref));
    const response = await fetch(
      `${GCS_JSON_API}/b/${encodeURIComponent(this.bucket)}/o/${object}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.status === 404) return;
    if (!response.ok) {
      logger.error({ status: response.status }, "Google Cloud Storage object deletion failed");
      throw new Error("Health document could not be removed from storage.");
    }
  }
}

const providers = new Map<string, StorageProvider>();

/**
 * Resolves a storage backend by the provider name persisted on the database
 * row. Reads/deletes MUST use this function rather than today's configured
 * provider, otherwise changing STORAGE_PROVIDER would make historical objects
 * unreadable or, worse, delete from the wrong backend.
 */
export function getStorageProviderByName(name: string): StorageProvider {
  const existing = providers.get(name);
  if (existing) return existing;

  let provider: StorageProvider;
  switch (name) {
    case "local":
      provider = new LocalStorageProvider(env.STORAGE_LOCAL_ROOT);
      logger.info({ provider: provider.name, root: env.STORAGE_LOCAL_ROOT }, "Storage provider initialized");
      break;
    case "gcs":
      provider = new GoogleCloudStorageProvider(env.STORAGE_GCS_BUCKET, env.STORAGE_GCS_PREFIX);
      logger.info({ provider: provider.name, bucket: env.STORAGE_GCS_BUCKET }, "Storage provider initialized");
      break;
    default:
      logger.error({ provider: name }, "Stored object references unsupported storage provider");
      throw new Error(`Unsupported storage provider: ${name}`);
  }

  providers.set(name, provider);
  return provider;
}

/**
 * Returns the storage provider used for NEW writes. Existing objects must be
 * resolved from their persisted `storageProvider` value with
 * `getStorageProviderByName`.
 */
export function getStorageProvider(): StorageProvider {
  return getStorageProviderByName(env.STORAGE_PROVIDER);
}
