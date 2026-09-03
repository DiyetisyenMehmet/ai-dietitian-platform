import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
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

/** Result of reading an object from storage. */
export interface GetObjectResult {
  stream: NodeJS.ReadableStream;
  contentType?: string;
  sizeBytes?: number;
}

/** Provider-agnostic storage contract. */
export interface StorageProvider {
  /** Short backend identifier persisted alongside the object reference. */
  readonly name: string;
  /** Writes (or overwrites) an object. */
  put(input: PutObjectInput): Promise<StoredObjectRef>;
  /** Opens an object for reads. */
  get(ref: StoredObjectRef): Promise<GetObjectResult>;
  /** Reads the full object into memory as a Buffer. */
  getBuffer(ref: StoredObjectRef): Promise<Buffer>;
  /** Removes an object (idempotent — a missing object is not an error). */
  delete(ref: StoredObjectRef): Promise<void>;
}

/**
 * Sanitizes a namespace/key segment so it can never escape the storage root or
 * inject arbitrary object-name components. Only a conservative character set
 * and explicit slash separators are preserved.
 */
function safeSegment(segment: string): string {
  return segment
    .split(/[/\\]+/)
    .map((part) => part.replace(/\.\.+/g, "").replace(/[^A-Za-z0-9._-]/g, ""))
    .filter((part) => part.length > 0)
    .join("/");
}

/** Local-disk storage backend rooted at `STORAGE_LOCAL_ROOT`. */
class LocalStorageProvider implements StorageProvider {
  public readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolvePath(ref: StoredObjectRef): string {
    const namespace = safeSegment(ref.namespace);
    const key = safeSegment(ref.key);
    return path.join(this.root, namespace, key);
  }

  async put(input: PutObjectInput): Promise<StoredObjectRef> {
    const filePath = this.resolvePath(input);
    await mkdir(path.dirname(filePath), { recursive: true });
    await pipeline(Readable.from(input.body), createWriteStream(filePath));
    return { namespace: input.namespace, key: input.key };
  }

  async get(ref: StoredObjectRef): Promise<GetObjectResult> {
    const filePath = this.resolvePath(ref);
    const info = await stat(filePath);
    return { stream: createReadStream(filePath), sizeBytes: info.size };
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
    const filePath = this.resolvePath(ref);
    await rm(filePath, { force: true });
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
