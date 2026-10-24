import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/api-error";
import { uploadSingleFile } from "../modules/blood-test/blood-test.upload";
import { uploadFoodImage } from "../modules/food-scan/food-scan.upload";
import { uploadPackageLabel } from "../modules/nutrition-data/package-label.upload";
import { detectAllowedMimeType } from "../modules/blood-test/blood-test.file-types";

// Exercise the existing memory-only middleware, with no DB, storage provider,
// production endpoint, image recognition or health record creation.
const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
const digest = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
const cases: [string, () => RequestHandler, number, boolean][] = [
  ["blood-test", uploadSingleFile, env.BLOOD_TEST_MAX_FILE_SIZE_MB * 1024 * 1024, true],
  ["food-photo", uploadFoodImage, 8 * 1024 * 1024, false],
  ["barcode-package-label", uploadPackageLabel, 8 * 1024 * 1024, false],
];

async function withServer(handler: RequestHandler, run: (url: string) => Promise<void>) {
  const app = express();
  app.post("/upload", handler, (req, res) => {
    assert.ok(req.file?.buffer);
    assert.equal(req.file.path, undefined, "files must stay in memory");
    res.json({ digest: digest(req.file.buffer), size: req.file.size, fields: req.body });
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error instanceof ApiError ? error.statusCode : 500).json({
      message: error instanceof Error ? error.message : "Unknown error",
    });
  };
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

function form(buffer = png, type = "image/png", field = "file") {
  const data = new FormData();
  data.append(field, new Blob([Uint8Array.from(buffer)], { type }), "synthetic.png");
  return data;
}

for (const [name, handler, maxBytes, metadataAllowed] of cases) {
  test(
    `${name}: accepted content bytes and metadata remain intact; file/MIME/field limits hold`,
    { timeout: 30000 },
    async () => {
      await withServer(handler(), async (url) => {
        const accepted = form();
        if (metadataAllowed) {
          accepted.append("label", "Synthetic report");
          accepted.append("testDate", "2026-01-01");
        }
        const response = await fetch(`${url}/upload`, { method: "POST", body: accepted });
        assert.equal(response.status, 200);
        const parsed = (await response.json()) as {
          digest: string;
          size: number;
          fields: Record<string, string>;
        };
        assert.equal(parsed.digest, digest(png));
        assert.equal(parsed.size, png.length);
        assert.deepEqual(
          parsed.fields,
          metadataAllowed ? { label: "Synthetic report", testDate: "2026-01-01" } : {},
        );

        const secondFile = form();
        secondFile.append(
          "file",
          new Blob([Uint8Array.from(png)], { type: "image/png" }),
          "second.png",
        );
        const extraField = form();
        if (metadataAllowed) {
          extraField.append("label", "Synthetic");
          extraField.append("testDate", "2026-01-01");
        }
        extraField.append("unexpected", "rejected");
        for (const rejected of [
          form(png, "application/octet-stream"),
          form(png, "image/png", "other"),
          secondFile,
          extraField,
        ]) {
          const result = await fetch(`${url}/upload`, { method: "POST", body: rejected });
          assert.equal(result.status, 400);
          await result.arrayBuffer();
        }
        const health = await fetch(`${url}/health`);
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { ok: true });
      });
    },
  );

  test(
    `${name}: configured maximum bytes are accepted and maximum plus one is rejected`,
    { timeout: 30000 },
    async () => {
      await withServer(handler(), async (url) => {
        const bytes = Buffer.alloc(maxBytes + 1);
        png.copy(bytes);
        const accepted = await fetch(`${url}/upload`, {
          method: "POST",
          body: form(bytes.subarray(0, maxBytes)),
        });
        assert.equal(accepted.status, 200);
        assert.equal(((await accepted.json()) as { size: number }).size, maxBytes);
        const rejected = await fetch(`${url}/upload`, { method: "POST", body: form(bytes) });
        assert.equal(rejected.status, 400);
        await rejected.arrayBuffer();
      });
    },
  );
}

test("declared MIME cannot replace existing blood-report magic-byte validation", () => {
  assert.equal(detectAllowedMimeType(Buffer.from("synthetic, not a PDF")), null);
  assert.equal(detectAllowedMimeType(Buffer.from("%PDF-1.4\nsynthetic")), "application/pdf");
  assert.equal(detectAllowedMimeType(png), "image/png");
});
