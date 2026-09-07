import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { bloodTestUploadRateLimiter } from "../../middleware/blood-test-rate-limit";
import { validate } from "../../middleware/validate";
import { bloodTestController } from "./blood-test.controller";
import {
  listBloodTestsQuerySchema,
  uploadIdParamSchema,
  uploadMetadataSchema,
} from "./blood-test.schemas";
import { uploadSingleFile } from "./blood-test.upload";

export const bloodTestRouter = Router();

bloodTestRouter.post(
  "/",
  authenticate,
  bloodTestUploadRateLimiter,
  uploadSingleFile(),
  validate({ body: uploadMetadataSchema }),
  bloodTestController.upload,
);

bloodTestRouter.get(
  "/",
  authenticate,
  validate({ query: listBloodTestsQuerySchema }),
  bloodTestController.list,
);

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
  bloodTestUploadRateLimiter,
  validate({ params: uploadIdParamSchema }),
  uploadSingleFile(),
  bloodTestController.replace,
);
