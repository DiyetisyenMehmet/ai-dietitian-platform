import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  GetObjectResult,
  PutObjectInput,
  StorageProvider,
  StoredObjectRef,
} from "./storage.types";
import { StorageError } from "./storage.types";

/**
 * Local filesystem provider for development/single-host deployments.
 *
 * Object paths are derived exclusively from trusted namespace/key identifiers.
 * Absolute paths, traversal segments and Windows drive/UNC paths are rejected
 * before resolution, then the resolved target is verified to remain below the
 * configured root as a second line of defense.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

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

  private resolveRef(ref: StoredObjectRef): string {
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
    const target = this.resolveRef(input);
    const directory = path.dirname(target);
    await mkdir(directory, { recursive: true });

    // Write in the destination directory, then atomically claim the final name
    // with a hard link. `link` fails with EEXIST rather than overwriting an
    // existing object, making the provider's overwrite policy explicit: no
    // implicit overwrite is allowed.
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
    const target = this.resolveRef(ref);
    try {
      const info = await stat(target);
      if (!info.isFile()) {
        throw new StorageError("NOT_FOUND", "Storage object not found.");
      }
    } catch (error) {
      if (error instanceof StorageError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new StorageError("NOT_FOUND", "Storage object not found.");
      }
      throw new StorageError("IO_ERROR", "Unable to read storage object.", { cause: error });
    }

    return { stream: createReadStream(target) };
  }

  /** Idempotent delete: an already-missing object is considered deleted. */
  async delete(ref: StoredObjectRef): Promise<void> {
    const target = this.resolveRef(ref);
    try {
      await unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new StorageError("IO_ERROR", "Unable to delete storage object.", { cause: error });
    }
  }
}
