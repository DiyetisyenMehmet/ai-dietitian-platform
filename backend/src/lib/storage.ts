import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { env } from "../config/env";
import { logger } from "./logger";

/**
 * Storage abstraction for Diewish.
 *
 * The binary payload of user documents (e.g. blood-test PDFs/images) is never
 * kept in the database — it lives in a pluggable storage backend referenced by
 * a `{ namespace, key }` pair. Only the local-disk provider ships today; the
 * interface is deliberately provider-agnostic so an object store (S3, GCS, …)
 * can be added later without touching any caller.
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
  /** Opens an object for streaming reads. */
  get(ref: StoredObjectRef): Promise<GetObjectResult>;
  /** Reads the full object into memory as a Buffer. */
  getBuffer(ref: StoredObjectRef): Promise<Buffer>;
  /** Removes an object (idempotent — a missing object is not an error). */
  delete(ref: StoredObjectRef): Promise<void>;
}

/**
 * Sanitizes a namespace/key segment so it can never escape the storage root
 * via path traversal. Backslashes and `..` sequences are stripped and only a
 * conservative character set is preserved.
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

let provider: StorageProvider | undefined;

/**
 * Returns the configured storage provider (singleton). Selection is driven by
 * the validated `STORAGE_PROVIDER` env var; only `local` is implemented today.
 */
export function getStorageProvider(): StorageProvider {
  if (provider) return provider;

  switch (env.STORAGE_PROVIDER) {
    case "local":
    default:
      provider = new LocalStorageProvider(env.STORAGE_LOCAL_ROOT);
      logger.info({ provider: provider.name, root: env.STORAGE_LOCAL_ROOT }, "Storage provider initialized");
      break;
  }

  return provider;
}
