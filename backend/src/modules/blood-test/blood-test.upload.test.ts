import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express, { type ErrorRequestHandler } from "express";

import { ApiError } from "../../utils/api-error";
import { uploadSingleFile } from "./blood-test.upload";

const LABEL = "Synthetic multipart boundary test";
const TEST_DATE = "2026-09-11";

async function withUploadServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();

  app.post("/upload", uploadSingleFile(), (req, res) => {
    if (!req.file || req.body.label !== LABEL || req.body.testDate !== TEST_DATE) {
      res.status(500).json({ message: "Expected multipart fields were not parsed." });
      return;
    }
    res.status(204).end();
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const statusCode = error instanceof ApiError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Unexpected upload error.";
    res.status(statusCode).json({ message });
  };
  app.use(errorHandler);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function submitUpload(baseUrl: string, includeUnexpectedField: boolean): Promise<Response> {
  const form = new FormData();
  form.append(
    "file",
    new Blob(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"], { type: "application/pdf" }),
    "synthetic.pdf",
  );
  form.append("label", LABEL);
  form.append("testDate", TEST_DATE);
  if (includeUnexpectedField) form.append("unexpected", "must-be-rejected");

  return fetch(`${baseUrl}/upload`, { method: "POST", body: form });
}

test("blood-test upload accepts file plus two metadata fields and rejects an extra part", async () => {
  await withUploadServer(async (baseUrl) => {
    const accepted = await submitUpload(baseUrl, false);
    assert.equal(accepted.status, 204);
    await accepted.arrayBuffer();

    const rejected = await submitUpload(baseUrl, true);
    assert.equal(rejected.status, 400);
    const body = (await rejected.json()) as { message?: string };
    assert.match(body.message ?? "", /too many (?:fields|parts)/i);
  });
});
