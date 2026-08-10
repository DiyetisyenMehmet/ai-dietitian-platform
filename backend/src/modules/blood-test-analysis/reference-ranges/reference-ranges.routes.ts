import { Router } from "express";

import { authenticate, authorize } from "../../../middleware/authenticate";
import { validate } from "../../../middleware/validate";
import { referenceRangesController } from "./reference-ranges.controller";
import {
  createReferenceRangeSchema,
  listRangesQuerySchema,
  rangeIdParamSchema,
  updateReferenceRangeSchema,
} from "./dto/reference-ranges.schemas";

/**
 * Admin router for blood-test reference ranges (mounted at
 * /api/blood-test-reference-ranges). All routes require an authenticated ADMIN
 * principal — reference ranges are shared clinical reference data, not
 * user-owned resources.
 */
export const referenceRangesRouter = Router();

referenceRangesRouter.use(authenticate, authorize("ADMIN"));

/**
 * @openapi
 * /api/blood-test-reference-ranges:
 *   get:
 *     tags: [BloodTestReferenceRanges]
 *     summary: List reference ranges (admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The reference ranges. }
 *   post:
 *     tags: [BloodTestReferenceRanges]
 *     summary: Create a reference range (admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: The created reference range. }
 */
referenceRangesRouter.get(
  "/",
  validate({ query: listRangesQuerySchema }),
  referenceRangesController.list,
);

referenceRangesRouter.post(
  "/",
  validate({ body: createReferenceRangeSchema }),
  referenceRangesController.create,
);

/**
 * @openapi
 * /api/blood-test-reference-ranges/{id}:
 *   get:
 *     tags: [BloodTestReferenceRanges]
 *     summary: Get a reference range by id (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The reference range. }
 *       404: { description: Not found. }
 *   patch:
 *     tags: [BloodTestReferenceRanges]
 *     summary: Update a reference range (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The updated reference range. }
 *       404: { description: Not found. }
 *   delete:
 *     tags: [BloodTestReferenceRanges]
 *     summary: Delete a reference range (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Deleted. }
 *       404: { description: Not found. }
 */
referenceRangesRouter.get(
  "/:id",
  validate({ params: rangeIdParamSchema }),
  referenceRangesController.getById,
);

referenceRangesRouter.patch(
  "/:id",
  validate({ params: rangeIdParamSchema, body: updateReferenceRangeSchema }),
  referenceRangesController.update,
);

referenceRangesRouter.delete(
  "/:id",
  validate({ params: rangeIdParamSchema }),
  referenceRangesController.remove,
);
