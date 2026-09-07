import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";

import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/utils/jwt";

const pdf = Buffer.from("%PDF-1.4\nHTTP TEST\n%%EOF");
let server: Server;
let baseUrl = "";
let accessToken = "";

async function clean(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await fs.rm(path.resolve(env.STORAGE_LOCAL_ROOT), { recursive: true, force: true });
}

before(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await clean();
  const user = await prisma.user.create({
    data: { email: "blood-http@example.com", passwordHash: "unused" },
  });
  accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
});

after(async () => {
  await clean();
  await prisma.$disconnect();
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

test("upload middleware rejects unsupported declared MIME", async () => {
  const form = new FormData();
  form.append("file", new Blob(["plain text"], { type: "text/plain" }), "report.txt");
  const response = await fetch(`${baseUrl}/api/blood-tests`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  assert.equal(response.status, 400);
});

test("download streams bytes with safe Unicode Content-Disposition", async () => {
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), "tahlil-şubat.pdf");
  const uploadResponse = await fetch(`${baseUrl}/api/blood-tests`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  assert.equal(uploadResponse.status, 201);
  const uploadBody = (await uploadResponse.json()) as {
    data: { upload: { id: string; originalFilename: string } };
  };
  const id = uploadBody.data.upload.id;

  const download = await fetch(`${baseUrl}/api/blood-tests/${id}/file`, {
    headers: authHeaders(),
  });
  assert.equal(download.status, 200);
  const disposition = download.headers.get("content-disposition") ?? "";
  assert.match(disposition, /filename="/i);
  assert.match(disposition, /filename\*=UTF-8''/i);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
});

test("history endpoint returns the cursor envelope", async () => {
  for (let index = 0; index < 2; index += 1) {
    const form = new FormData();
    form.append("file", new Blob([pdf], { type: "application/pdf" }), `report-${index}.pdf`);
    const response = await fetch(`${baseUrl}/api/blood-tests`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    assert.equal(response.status, 201);
  }

  const first = await fetch(`${baseUrl}/api/blood-tests?limit=1`, { headers: authHeaders() });
  assert.equal(first.status, 200);
  const body = (await first.json()) as { data: { items: unknown[]; nextCursor: string | null } };
  assert.equal(body.data.items.length, 1);
  assert.ok(body.data.nextCursor);
});
