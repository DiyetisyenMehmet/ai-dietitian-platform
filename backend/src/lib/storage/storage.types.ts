import type { Readable } from "node:stream";

/** Opaque object identity inside a storage provider. */
export interface StoredObjectRef {
  namespace: string;
  key: string;
}

export interface PutObjectInput extends StoredObjectRef {
  body: Buffer;
  contentType?: string;
}

export interface GetObjectResult {
  stream: Readable;
}

/** Minimal provider contract used by blood-test uploads. */
export interface StorageProvider {
  readonly name: string;
  put(input: PutObjectInput): Promise<StoredObjectRef>;
  get(ref: StoredObjectRef): Promise<GetObjectResult>;
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
