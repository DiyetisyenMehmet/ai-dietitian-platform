import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess, sendError } from "../../utils/api-response";
import { adminSystemService } from "./admin-system.service";

export const adminSystemController = {
  health: asyncHandler(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, await adminSystemService.health());
  }),
  operations: asyncHandler(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      sendSuccess(res, await adminSystemService.operations());
    } catch {
      // Do not pass database/provider error details into the response or logs.
      sendError(res, 503, "SERVICE_UNAVAILABLE", "Operasyon özeti şu anda alınamıyor.");
    }
  }),
};
