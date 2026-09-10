import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import sharp from "sharp";

import {
  documentEnhancementService,
  VISION_IMAGE_MAX_LONG_EDGE,
  VISION_INLINE_IMAGE_BUDGET_BYTES,
} from "./document-enhancement.service";

test("large phone-camera dimensions are reduced without enlarging the AI payload", async () => {
  const source = await sharp({
    create: {
      width: 5000,
      height: 1000,
      channels: 3,
      background: "#f5f5f5",
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();

  const result = await documentEnhancementService.enhance(source, "image/jpeg");
  const metadata = await sharp(result.buffer).metadata();

  assert.equal(result.mimeType, "image/jpeg");
  assert.ok((metadata.width ?? 0) <= VISION_IMAGE_MAX_LONG_EDGE);
  assert.ok((metadata.height ?? 0) <= VISION_IMAGE_MAX_LONG_EDGE);
  assert.ok(result.buffer.length <= VISION_INLINE_IMAGE_BUDGET_BYTES);
});

test("high-entropy oversized PNG is kept below the Vertex inline byte budget", async () => {
  const width = 2300;
  const height = 2300;
  const raw = randomBytes(width * height * 3);
  const source = await sharp(raw, {
    raw: { width, height, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();

  assert.ok(source.length > VISION_INLINE_IMAGE_BUDGET_BYTES);

  const result = await documentEnhancementService.enhance(source, "image/png");
  const metadata = await sharp(result.buffer).metadata();

  assert.ok(result.buffer.length <= VISION_INLINE_IMAGE_BUDGET_BYTES);
  assert.ok(result.mimeType === "image/png" || result.mimeType === "image/jpeg");
  assert.ok((metadata.width ?? 0) <= VISION_IMAGE_MAX_LONG_EDGE);
  assert.ok((metadata.height ?? 0) <= VISION_IMAGE_MAX_LONG_EDGE);
});
