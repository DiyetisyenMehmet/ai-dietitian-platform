import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer from "multer";

import { ApiError } from "../../utils/api-error";

const FIELD = "file";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
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
        return next(ApiError.badRequest(error.message));
      }
      next(error);
    });
  };
}
