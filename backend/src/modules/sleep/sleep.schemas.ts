import { z } from "zod";

const isoDateTime = z.string().datetime({ message: "Expected an ISO-8601 datetime string." });

export const createSleepSchema = z.object({
  sleepStart: isoDateTime,
  wakeTime: isoDateTime,
  quality: z.number().int().min(1).max(5),
  note: z.string().trim().max(500).optional(),
});

export const updateSleepSchema = createSleepSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one sleep field must be supplied.",
);

export const sleepIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID."),
});

export type CreateSleepInput = z.infer<typeof createSleepSchema>;
export type UpdateSleepInput = z.infer<typeof updateSleepSchema>;
