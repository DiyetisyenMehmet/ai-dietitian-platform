import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

import { env } from "../src/config/env";
import { getStorageProvider } from "../src/lib/storage";
import { prisma } from "../src/lib/prisma";
import { bloodTestRepository } from "../src/modules/blood-test/blood-test.repository";
import { bloodTestService } from "../src/modules/blood-test/blood-test.service";
import { ApiError } from "../src/utils/api-error";

const context = { userAgent: "blood-test-suite", ipAddress: "127.0.0.1" };
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");

async function clean(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await fs.rm(path.resolve(env.STORAGE_LOCAL_ROOT), { recursive: true, force: true });
}

async function user(email: string): Promise<string> {
  const row = await prisma.user.create({
    data: { email, passwordHash: "not-used-in-blood-tests" },
  });
  return row.id;
}

async function expectApiError(operation: Promise<unknown>, status: number): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    return error instanceof ApiError && error.statusCode === status;
  });
}

async function fileCount(root: string): Promise<number> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const full = path.join(root, entry.name);
      count += entry.isDirectory() ? await fileCount(full) : 1;
    }
    return count;
  } catch {
    return 0;
  }
}

beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test("valid PDF upload stores authoritative bytes and canonicalizes a fake extension", async () => {
  const userId = await user("blood-valid@example.com");
  const result = await bloodTestService.upload(
    userId,
    { buffer: pdf, originalName: "report.exe", size: 999_999 },
    {},
    context,
  );

  assert.equal(result.mimeType, "application/pdf");
  assert.equal(result.originalFilename, "report.pdf");
  assert.equal(result.fileSizeBytes, pdf.length, "buffer length is authoritative");
  const row = await prisma.bloodTestUpload.findUniqueOrThrow({ where: { id: result.id } });
  assert.match(row.storageKey, /^[0-9a-f-]{36}\.pdf$/i);
});

test("empty, incorrect magic and oversized buffers are rejected before persistence", async () => {
  const userId = await user("blood-invalid@example.com");
  await expectApiError(
    bloodTestService.upload(userId, { buffer: Buffer.alloc(0), originalName: "empty.pdf", size: 0 }, {}, context),
    400,
  );
  await expectApiError(
    bloodTestService.upload(
      userId,
      { buffer: Buffer.from("not actually a pdf"), originalName: "fake.pdf", size: 18 },
      {},
      context,
    ),
    400,
  );
  const oversized = Buffer.alloc(env.BLOOD_TEST_MAX_FILE_SIZE_MB * 1024 * 1024 + 1, 0x41);
  await expectApiError(
    bloodTestService.upload(
      userId,
      { buffer: oversized, originalName: "large.pdf", size: oversized.length },
      {},
      context,
    ),
    400,
  );
  assert.equal(await prisma.bloodTestUpload.count({ where: { userId } }), 0);
});

test("ownership prevents cross-user read, download and deletion", async () => {
  const ownerId = await user("blood-owner@example.com");
  const otherId = await user("blood-other@example.com");
  const upload = await bloodTestService.upload(
    ownerId,
    { buffer: pdf, originalName: "report.pdf", size: pdf.length },
    {},
    context,
  );

  await expectApiError(bloodTestService.getById(otherId, upload.id), 404);
  await expectApiError(bloodTestService.getFile(otherId, upload.id), 404);
  await expectApiError(bloodTestService.remove(otherId, upload.id, context), 404);
  assert.equal(await prisma.bloodTestUpload.count({ where: { id: upload.id } }), 1);
});

test("replace repoints metadata, removes old object and owner delete is final", async () => {
  const userId = await user("blood-replace@example.com");
  const upload = await bloodTestService.upload(
    userId,
    { buffer: pdf, originalName: "first.pdf", size: pdf.length },
    {},
    context,
  );
  const before = await prisma.bloodTestUpload.findUniqueOrThrow({ where: { id: upload.id } });

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const replaced = await bloodTestService.replaceFile(
    userId,
    upload.id,
    { buffer: png, originalName: "new.bad", size: png.length },
    context,
  );
  const afterRow = await prisma.bloodTestUpload.findUniqueOrThrow({ where: { id: upload.id } });
  assert.equal(replaced.originalFilename, "new.png");
  assert.notEqual(afterRow.storageKey, before.storageKey);

  const storage = getStorageProvider();
  await assert.rejects(
    storage.get({ namespace: `blood-tests/${userId}`, key: before.storageKey }),
  );

  await bloodTestService.remove(userId, upload.id, context);
  assert.equal(await prisma.bloodTestUpload.count({ where: { id: upload.id } }), 0);
});

test("database failure after storage put cleans up the orphan object", async () => {
  const userId = await user("blood-db-failure@example.com");
  const storageRoot = path.resolve(env.STORAGE_LOCAL_ROOT);
  const originalCreate = bloodTestRepository.create;
  bloodTestRepository.create = async () => {
    throw new Error("synthetic database failure");
  };
  try {
    await assert.rejects(
      bloodTestService.upload(
        userId,
        { buffer: pdf, originalName: "orphan.pdf", size: pdf.length },
        {},
        context,
      ),
      /synthetic database failure/,
    );
    assert.equal(await fileCount(storageRoot), 0);
  } finally {
    bloodTestRepository.create = originalCreate;
  }
});

test("storage put failure creates no database row", async () => {
  const userId = await user("blood-storage-failure@example.com");
  const storage = getStorageProvider();
  const originalPut = storage.put;
  storage.put = async () => {
    throw new Error("synthetic storage failure");
  };
  try {
    await assert.rejects(
      bloodTestService.upload(
        userId,
        { buffer: pdf, originalName: "failure.pdf", size: pdf.length },
        {},
        context,
      ),
      /synthetic storage failure/,
    );
    assert.equal(await prisma.bloodTestUpload.count({ where: { userId } }), 0);
  } finally {
    storage.put = originalPut;
  }
});

test("history uses deterministic cursor pagination with default-sized pages", async () => {
  const userId = await user("blood-page@example.com");
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  for (let index = 0; index < 25; index += 1) {
    await prisma.bloodTestUpload.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        storageProvider: "local",
        storageKey: `page-${index}.pdf`,
        originalFilename: `page-${index}.pdf`,
        mimeType: "application/pdf",
        fileSizeBytes: 10,
        checksumSha256: "a".repeat(64),
        createdAt,
      },
    });
  }

  const first = await bloodTestService.list(userId, 20);
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const second = await bloodTestService.list(userId, 20, first.nextCursor ?? undefined);
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
  const overlap = first.items.some((item) => second.items.some((other) => other.id === item.id));
  assert.equal(overlap, false);
});
