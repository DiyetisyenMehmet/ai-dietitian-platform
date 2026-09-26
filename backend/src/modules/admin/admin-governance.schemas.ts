import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const roleKeySchema = z.string().trim().min(2).max(64).regex(/^[A-Z0-9_]+$/);
const reasonSchema = z.string().trim().min(3).max(500);
const permissionKeySchema = z.string().trim().min(3).max(96);

export const adminInvitationCreateSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1).max(120).optional(),
  roleKeys: z.array(roleKeySchema).min(1).max(12).transform((items) => [...new Set(items)]),
  reason: reasonSchema,
});

export const adminRoleCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
  permissionKeys: z.array(permissionKeySchema).min(1).max(64).transform((items) => [...new Set(items)]),
  reason: reasonSchema,
});

export const adminRoleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
  permissionKeys: z.array(permissionKeySchema).min(1).max(64).transform((items) => [...new Set(items)]),
  reason: reasonSchema,
});

export const adminRoleParamsSchema = z.object({
  key: roleKeySchema,
});

export const adminStaffParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminStaffSessionParamsSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export const adminSessionMutationSchema = z.object({
  reason: reasonSchema,
});

export const adminAuditQuerySchema = z.object({
  admin: z.string().trim().max(254).optional(),
  user: z.string().trim().max(254).optional(),
  action: z.string().trim().max(120).optional(),
  module: z.string().trim().max(64).optional(),
  risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  environment: z.string().trim().max(32).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type AdminInvitationCreateInput = z.infer<typeof adminInvitationCreateSchema>;
export type AdminRoleCreateInput = z.infer<typeof adminRoleCreateSchema>;
export type AdminRoleUpdateInput = z.infer<typeof adminRoleUpdateSchema>;
export type AdminSessionMutationInput = z.infer<typeof adminSessionMutationSchema>;
export type AdminAuditQueryInput = z.infer<typeof adminAuditQuerySchema>;
