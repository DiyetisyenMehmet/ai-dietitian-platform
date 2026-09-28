import { z } from "zod";

export const adminUsersQuerySchema = z.object({
  search: z.string().trim().max(254).default(""),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const adminUserParamsSchema = z.object({ id: z.string().uuid() });
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
