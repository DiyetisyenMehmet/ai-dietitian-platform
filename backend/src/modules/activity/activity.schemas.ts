import { z } from "zod";

/**
 * Validation schema for the Sprint 22 Activity API. Inputs are validated
 * defensively so a bad client cannot poison the movement/exercise signals the
 * AI Health Coach reasons over. Mirrors the Sprint 19 tracking schemas.
 */

/** Optional ISO timestamp; defaults to "now" when omitted. */
const optionalLoggedAt = z
  .string()
  .datetime({ message: "loggedAt must be an ISO-8601 datetime string." })
  .optional();

export const createActivitySchema = z.object({
  type: z.enum([
    "WALKING",
    "RUNNING",
    "CYCLING",
    "SWIMMING",
    "STRENGTH_TRAINING",
    "YOGA",
    "HIIT",
    "SPORTS",
    "OTHER",
  ]),
  name: z.string().trim().max(200).optional(),
  durationMinutes: z.number().int().positive().max(1440),
  caloriesBurned: z.number().min(0).max(20000).optional(),
  note: z.string().trim().max(280).optional(),
  loggedAt: optionalLoggedAt,
});

/** Activity ids are UUIDs in the persisted domain model. */
export const activityIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID."),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
