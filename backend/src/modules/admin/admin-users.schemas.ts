import { z } from "zod";

export const adminUsersQuerySchema = z.object({
  search: z.string().trim().max(254).default(""),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const adminUserParamsSchema = z.object({ id: z.string().uuid() });
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminUserStatusSchema = z
  .object({
    isActive: z.boolean(),
    reason: z.string().trim().min(3).max(500),
    confirmed: z.literal(true),
  })
  .strict();
export const adminUserOperationSchema = z
  .object({ reason: z.string().trim().min(3).max(500), confirmed: z.literal(true) })
  .strict();
export const adminUserSessionParamsSchema = adminUserParamsSchema.extend({
  sessionId: z.string().uuid(),
});


const adminEntitlementReasonSchema = z.string().trim().min(3).max(500);
const adminEntitlementTimestampSchema = z.string().datetime({ offset: true });

export const adminSupportEntitlementUpsertSchema = z
  .object({
    tier: z.enum(["PREMIUM", "PREMIUM_PLUS"]),
    expiresAt: adminEntitlementTimestampSchema.nullable(),
    expectedUpdatedAt: adminEntitlementTimestampSchema.nullable(),
    reason: adminEntitlementReasonSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const adminSupportEntitlementRevokeSchema = z
  .object({
    expectedUpdatedAt: adminEntitlementTimestampSchema,
    reason: adminEntitlementReasonSchema,
    confirmed: z.literal(true),
  })
  .strict();
