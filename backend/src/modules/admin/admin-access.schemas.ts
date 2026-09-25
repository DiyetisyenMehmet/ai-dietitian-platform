import { z } from "zod";

const adminEmailSchema = z.string().trim().toLowerCase().email().max(254);
const temporaryPasswordSchema = z.string()
  .min(12)
  .max(128)
  .regex(/[A-Za-z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9]/);

export const adminAccessLevelSchema = z.enum(["LIMITED", "FULL"]);

export const adminCreateAccessUserSchema = z.object({
  email: adminEmailSchema,
  fullName: z.string().trim().min(1).max(120).optional(),
  temporaryPassword: temporaryPasswordSchema,
  accessLevel: adminAccessLevelSchema,
});

export const adminUpdateAccessUserSchema = z.object({
  accessLevel: adminAccessLevelSchema,
  isActive: z.boolean().optional(),
});

export const adminAccessUserParamsSchema = z.object({
  id: z.string().uuid(),
});

export type AdminAccessLevel = z.infer<typeof adminAccessLevelSchema>;
export type AdminCreateAccessUserInput = z.infer<typeof adminCreateAccessUserSchema>;
export type AdminUpdateAccessUserInput = z.infer<typeof adminUpdateAccessUserSchema>;
