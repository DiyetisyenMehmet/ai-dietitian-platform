import { z } from "zod";

/**
 * Zod DTO schemas for the blood-test analysis endpoints. The analysis is
 * triggered from an existing upload id, so the only request input to validate
 * is the upload id route param.
 */

/** Route param: the uploaded blood-test id (UUID). */
export const bloodTestIdParamSchema = z.object({
  id: z.string().uuid("A valid blood test id is required"),
});

export type BloodTestIdParam = z.infer<typeof bloodTestIdParamSchema>;
