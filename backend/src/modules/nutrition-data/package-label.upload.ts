import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer from "multer";

import { ApiError } from "../../utils/api-error";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(ApiError.badRequest("Besin etiketi için JPG, PNG veya WebP görsel yükleyebilirsin."));
      return;
    }
    cb(null, true);
  },
});

export function uploadPackageLabel(): RequestHandler {
  const handler = upload.single("file");
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") return next(ApiError.badRequest("Etiket görseli 8 MB'den küçük olmalı."));
        return next(ApiError.badRequest(error.message));
      }
      next(error);
    });
  };
}
