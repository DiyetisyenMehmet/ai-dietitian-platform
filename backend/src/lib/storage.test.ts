import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalStorageProvider, StorageError } from "./storage";

async function withProvider(
  run: (provider: LocalStorageProvider, root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "diewish-storage-"));
  try {
    await run(new LocalStorageProvider(root), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("local storage preserves binary bytes and rejects silent overwrite", async () => {
  await withProvider(async (provider) => {
    const ref = { namespace: "blood-tests/user-1", key: "sample.bin" };
    const original = Buffer.from([0x00, 0xff, 0x13, 0x37, 0x80, 0x42]);

    await provider.put({ ...ref, body: original, contentType: "application/octet-stream" });
    assert.deepEqual(await provider.getBuffer(ref), original);

    await assert.rejects(
      provider.put({
        ...ref,
        body: Buffer.from("replacement"),
        contentType: "application/octet-stream",
      }),
      (error: unknown) => error instanceof StorageError && error.code === "CONFLICT",
    );
    assert.deepEqual(await provider.getBuffer(ref), original);
  });
});

test("local storage rejects traversal and absolute path references", async () => {
  await withProvider(async (provider) => {
    const invalidRefs = [
      { namespace: "../outside", key: "x.bin" },
      { namespace: "blood-tests/user-1", key: "../x.bin" },
      { namespace: "/tmp/outside", key: "x.bin" },
      { namespace: "C:\\outside", key: "x.bin" },
      { namespace: "\\\\server\\share", key: "x.bin" },
    ];

    for (const ref of invalidRefs) {
      await assert.rejects(
        provider.put({ ...ref, body: Buffer.from("x"), contentType: "application/octet-stream" }),
        (error: unknown) => error instanceof StorageError && error.code === "INVALID_REF",
      );
    }
  });
});

test("local storage delete is idempotent", async () => {
  await withProvider(async (provider) => {
    const ref = { namespace: "blood-tests/user-2", key: "delete.bin" };
    await provider.put({ ...ref, body: Buffer.from("delete-me"), contentType: "application/octet-stream" });

    await provider.delete(ref);
    await provider.delete(ref);
    await assert.rejects(
      provider.getBuffer(ref),
      (error: unknown) => error instanceof StorageError && error.code === "NOT_FOUND",
    );
  });
});
