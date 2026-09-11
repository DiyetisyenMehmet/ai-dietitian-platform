import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer, { type Options as MulterOptions } from "multer";

import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { ALLOWED_MIME_TYPES, ALLOWED_TYPES_LABEL } from "./blood-test.file-types";

/** Field name expected in the multipart/form-data request. */
export const UPLOAD_FIELD = "file";

const maxBytes = env.BLOOD_TEST_MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_UPLOAD_FILES = 1;
const MAX_UPLOAD_FIELDS = 2;
const MAX_ACCEPTED_PARTS = MAX_UPLOAD_FILES + MAX_UPLOAD_FIELDS;

/**
 * Busboy emits `partsLimit` when its internal part counter reaches the configured
 * value, not only after it exceeds it. Multer converts that event into
 * LIMIT_PART_COUNT. Therefore a parser limit of N rejects the Nth otherwise
 * valid part. We accept exactly one file plus the two documented metadata
 * fields, so the parser sentinel must be one greater than the application
 * maximum. A fourth real part reaches the sentinel and is still rejected.
 */
const BUSBOY_PARTS_LIMIT_SENTINEL = MAX_ACCEPTED_PARTS + 1;

type MulterLimits = NonNullable<MulterOptions["limits"]> & {
  /** Multer 2.3 runtime limit; @types/multer 2.2 has not published it yet. */
  fieldArrayIndexLimit: number;
};

const uploadLimits: MulterLimits = {
  fileSize: maxBytes,
  files: MAX_UPLOAD_FILES,
  fields: MAX_UPLOAD_FIELDS,
  parts: BUSBOY_PARTS_LIMIT_SENTINEL,
  fieldNameSize: 100,
  fieldSize: 1024,
  fieldArrayIndexLimit: 0,
};

/**
 * Multer instance for blood-test uploads.
 *
 * Files are buffered in memory (not written to a temp path) so the service can
 * sniff their real content type and hand the bytes directly to the storage
 * abstraction. A single file is accepted; size is capped; multipart metadata is
 * intentionally bounded; and an early filter rejects obviously-wrong declared
 * content types. The authoritative type check is a magic-byte inspection
 * performed later in the service.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: uploadLimits,
  fileFilter: (_req, file, cb) => {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(ApiError.badRequest(`Unsupported file type. Allowed types: ${ALLOWED_TYPES_LABEL}.`));
      return;
    }
    cb(null, true);
  },
});

/**
 * Wraps multer's single-file handler to translate its errors into the API's
 * `ApiError` shape (e.g. size-limit → 400 with a clear message) so the global
 * error handler renders a consistent envelope.
 */
export function uploadSingleFile(): RequestHandler {
  const handler = upload.single(UPLOAD_FIELD);
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          next(
            ApiError.badRequest(
              `File is too large. Maximum size is ${env.BLOOD_TEST_MAX_FILE_SIZE_MB} MB.`,
            ),
          );
          return;
        }
        if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
          next(ApiError.badRequest(`Upload exactly one file in the "${UPLOAD_FIELD}" field.`));
          return;
        }
        next(ApiError.badRequest(err.message));
        return;
      }
      next(err);
    });
  };
}
