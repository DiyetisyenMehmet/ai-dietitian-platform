import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { bloodTestController } from "./blood-test.controller";
import { uploadIdParamSchema, uploadMetadataSchema } from "./blood-test.schemas";
import { uploadSingleFile } from "./blood-test.upload";

/**
 * Blood-test upload router (mounted at /api/blood-tests). Every route requires a
 * valid access token; the service additionally scopes all access by owner so a
 * user can only ever see or mutate their own uploads.
 *
 * For multipart routes, the upload middleware runs before `validate` so the
 * text fields it parses are available to the body schema.
 */
export const bloodTestRouter = Router();

/**
 * @openapi
 * /api/blood-tests:
 *   post:
 *     tags: [BloodTests]
 *     summary: Upload a blood-test file (PDF or image)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *               label: { type: string }
 *               testDate: { type: string, format: date }
 *     responses:
 *       201: { description: Uploaded; returns the upload metadata. }
 *       400: { description: Missing/invalid/oversized file or bad type. }
 *       401: { description: Missing or invalid access token. }
 *   get:
 *     tags: [BloodTests]
 *     summary: List the authenticated user's blood-test uploads
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Upload history, newest first. }
 *       401: { description: Missing or invalid access token. }
 */
bloodTestRouter.post(
  "/",
  authenticate,
  uploadSingleFile(),
  validate({ body: uploadMetadataSchema }),
  bloodTestController.upload,
);

bloodTestRouter.get("/", authenticate, bloodTestController.list);

/**
 * @openapi
 * /api/blood-tests/{id}:
 *   get:
 *     tags: [BloodTests]
 *     summary: Get a single upload's metadata
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The upload metadata. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: Not found or not owned by the caller. }
 *   delete:
 *     tags: [BloodTests]
 *     summary: Delete an upload (record and stored file)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Deleted. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: Not found or not owned by the caller. }
 */
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

/**
 * @openapi
 * /api/blood-tests/{id}/file:
 *   get:
 *     tags: [BloodTests]
 *     summary: Download/stream the stored file
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The raw file stream. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: Not found or not owned by the caller. }
 *   put:
 *     tags: [BloodTests]
 *     summary: Replace the stored file of an existing upload
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       200: { description: Replaced; returns the updated metadata. }
 *       400: { description: Missing/invalid/oversized file or bad type. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: Not found or not owned by the caller. }
 */
bloodTestRouter.get(
  "/:id/file",
  authenticate,
  validate({ params: uploadIdParamSchema }),
  bloodTestController.download,
);

bloodTestRouter.put(
  "/:id/file",
  authenticate,
  validate({ params: uploadIdParamSchema }),
  uploadSingleFile(),
  bloodTestController.replace,
);
