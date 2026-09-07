import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer, { type Options as MulterOptions } from "multer";

import { ApiError } from "../../utils/api-error";

const FIELD = "file";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

type MulterLimits = NonNullable<MulterOptions["limits"]> & {
  /** Multer 2.3 runtime limit; @types/multer 2.2 has not published it yet. */
  fieldArrayIndexLimit: number;
};

const uploadLimits: MulterLimits = {
  fileSize: MAX_BYTES,
  files: 1,
  fields: 0,
  parts: 1,
  fieldNameSize: 100,
  fieldSize: 1024,
  fieldArrayIndexLimit: 0,
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: uploadLimits,
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(ApiError.badRequest("Yalnızca JPG, PNG veya WebP görsel yükleyebilirsiniz."));
      return;
    }
    cb(null, true);
  },
});

export function uploadFoodImage(): RequestHandler {
  const handler = upload.single(FIELD);
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return next(ApiError.badRequest("Görsel 8 MB'den küçük olmalı."));
        }
        if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
          return next(ApiError.badRequest(`Yalnızca "${FIELD}" alanında tek bir görsel yükleyebilirsiniz.`));
        }
        return next(ApiError.badRequest(error.message));
      }
      next(error);
    });
  };
}
