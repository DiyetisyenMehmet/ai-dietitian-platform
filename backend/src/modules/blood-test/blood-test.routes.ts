import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { bloodTestController } from "./blood-test.controller";
import { uploadIdParamSchema, uploadMetadataSchema } from "./blood-test.schemas";
import { uploadSingleFile } from "./blood-test.upload";

/**
 * Blood-test upload router (mounted at /api/blood-tests). Every route requires a
 * valid access token; the service additionally scopes all access by owner so a
 * user can only ever see or mutate their own uploads. New file intake requires
 * current mandatory consent BEFORE multipart parsing receives health data.
 */
export const bloodTestRouter = Router();

/**
 * Upload + analyze in one request. This is the preferred web-client flow while
 * local Cloud Run storage is ephemeral, because the stored bytes are consumed
 * by the analysis pipeline on the same instance that accepted the upload.
 */
bloodTestRouter.post(
  "/analyze-upload",
  authenticate,
  requireConsent,
  uploadSingleFile(),
  validate({ body: uploadMetadataSchema }),
  bloodTestController.uploadAndAnalyze,
);

/** Upload only (kept for API/back-office workflows). */
bloodTestRouter.post(
  "/",
  authenticate,
  requireConsent,
  uploadSingleFile(),
  validate({ body: uploadMetadataSchema }),
  bloodTestController.upload,
);

bloodTestRouter.get("/", authenticate, bloodTestController.list);

bloodTestRouter.get(
  "/:id",
  authenticate,
  validate({ params: uploadIdParamSchema }),
  bloodTestController.getById,
);

bloodTestRouter.delete(
  "/:id",
  authenticate,
  validate({ params: uploadIdParamSchema }),
  bloodTestController.remove,
);

bloodTestRouter.get(
  "/:id/file",
  authenticate,
  validate({ params: uploadIdParamSchema }),
  bloodTestController.download,
);

bloodTestRouter.put(
  "/:id/file",
  authenticate,
  requireConsent,
  validate({ params: uploadIdParamSchema }),
  uploadSingleFile(),
  bloodTestController.replace,
);
