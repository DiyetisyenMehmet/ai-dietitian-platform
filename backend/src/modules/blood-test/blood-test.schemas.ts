import { z } from "zod";

export const uploadIdParamSchema = z.object({
  id: z.string().uuid("A valid upload id is required"),
});

export const listBloodTestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid("cursor must be a valid upload id").optional(),
});

export const uploadMetadataSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  testDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "testDate must be in YYYY-MM-DD format")
    .refine((value) => !Number.isNaN(Date.parse(value)), "testDate is not a valid date")
    .refine((value) => new Date(`${value}T00:00:00.000Z`).getTime() <= Date.now(), {
      message: "testDate cannot be in the future",
    })
    .optional(),
});

export type UploadIdParam = z.infer<typeof uploadIdParamSchema>;
export type ListBloodTestsQuery = z.infer<typeof listBloodTestsQuerySchema>;
export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;
