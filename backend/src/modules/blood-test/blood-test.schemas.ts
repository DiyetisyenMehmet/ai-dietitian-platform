import { z } from "zod";

import { isValidIsoCalendarDate } from "../../utils/calendar-date";

/**
 * Zod schemas for the blood-test module. File contents are validated separately
 * (size via multer, true type via magic-byte sniffing); these schemas cover the
 * route params and the optional multipart text fields that accompany a file.
 */

/** Route param: the upload id (UUID). */
export const uploadIdParamSchema = z.object({
  id: z.string().uuid("A valid upload id is required"),
});

/**
 * Metadata sent alongside an upload as multipart form fields. Values arrive as
 * strings; `testDate` is required because freshness must use the report's real
 * calendar date rather than its upload time. It must not be in the future.
 */
export const uploadMetadataSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  testDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "testDate must be in YYYY-MM-DD format")
    .refine(isValidIsoCalendarDate, "testDate is not a valid calendar date")
    .refine((value) => new Date(`${value}T00:00:00.000Z`).getTime() <= Date.now(), {
      message: "testDate cannot be in the future",
    }),
});

export type UploadIdParam = z.infer<typeof uploadIdParamSchema>;
export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;
