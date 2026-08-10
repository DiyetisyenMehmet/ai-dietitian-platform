import type { Request, Response } from "express";

import { sendCreated, sendSuccess } from "../../../utils/api-response";
import { asyncHandler } from "../../../utils/async-handler";
import { referenceRangesService } from "./reference-ranges.service";
import type {
  CreateReferenceRangeInput,
  ListRangesQuery,
  RangeIdParam,
  UpdateReferenceRangeInput,
} from "./dto/reference-ranges.schemas";

/**
 * Admin controller for managing blood-test reference ranges. Every handler is
 * mounted behind `authenticate` + `authorize(ADMIN)` at the router level.
 */
export const referenceRangesController = {
  /** Lists reference ranges (optionally filtered). */
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListRangesQuery;
    const ranges = await referenceRangesService.list(query);
    sendSuccess(res, { ranges });
  }),

  /** Fetches a single reference range by id. */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as RangeIdParam;
    const range = await referenceRangesService.getById(id);
    sendSuccess(res, { range });
  }),

  /** Creates a new reference range. */
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateReferenceRangeInput;
    const range = await referenceRangesService.create(input);
    sendCreated(res, { range });
  }),

  /** Updates an existing reference range. */
  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as RangeIdParam;
    const input = req.body as UpdateReferenceRangeInput;
    const range = await referenceRangesService.update(id, input);
    sendSuccess(res, { range });
  }),

  /** Deletes a reference range. */
  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as RangeIdParam;
    await referenceRangesService.remove(id);
    sendSuccess(res, { message: "Reference range deleted." });
  }),
};
