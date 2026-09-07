import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { LocalStorageProvider } from "../src/lib/storage/local-storage.provider";
import { StorageError } from "../src/lib/storage/storage.types";

async function withProvider(run: (provider: LocalStorageProvider, root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "diewish-storage-test-"));
  try {
    await run(new LocalStorageProvider(root), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

test("local storage put/get/delete round-trip is binary-safe and delete is idempotent", async () => {
  await withProvider(async (provider, root) => {
    const body = Buffer.from([0, 1, 2, 3, 255]);
    const ref = { namespace: "blood-tests/user-1", key: "object.bin" };

    await provider.put({ ...ref, body, contentType: "application/octet-stream" });
    const result = await provider.get(ref);
    assert.deepEqual(await streamToBuffer(result.stream), body);
    assert.deepEqual(await readFile(path.join(root, "blood-tests", "user-1", "object.bin")), body);

    await provider.delete(ref);
    await provider.delete(ref);
    await assert.rejects(() => provider.get(ref), (error: unknown) => {
      return error instanceof StorageError && error.code === "NOT_FOUND";
    });
  });
});

test("local storage refuses traversal, absolute and Windows-style escape references", async () => {
  await withProvider(async (provider) => {
    const invalidRefs = [
      { namespace: "../../../etc", key: "passwd" },
      { namespace: "blood-tests/user", key: "../secret" },
      { namespace: "blood-tests/user", key: "/absolute/path" },
      { namespace: "blood-tests/user", key: "C:\\secret\\file" },
      { namespace: "blood-tests\\..\\secret", key: "file" },
    ];

    for (const ref of invalidRefs) {
      await assert.rejects(
        () => provider.put({ ...ref, body: Buffer.from("x") }),
        (error: unknown) => error instanceof StorageError && error.code === "INVALID_REF",
      );
    }
  });
});

test("local storage never silently overwrites an existing object", async () => {
  await withProvider(async (provider) => {
    const ref = { namespace: "blood-tests/user-1", key: "same-key.pdf" };
    await provider.put({ ...ref, body: Buffer.from("first") });

    await assert.rejects(
      () => provider.put({ ...ref, body: Buffer.from("second") }),
      (error: unknown) => error instanceof StorageError && error.code === "CONFLICT",
    );

    const result = await provider.get(ref);
    assert.equal((await streamToBuffer(result.stream)).toString(), "first");
  });
});
