import { z } from "zod";

/**
 * Zod schemas and derived DTO types for the auth module. These are the single
 * source of truth for request shapes; the `validate` middleware parses against
 * them and controllers/services consume the inferred types.
 */

/** Password policy: reasonable minimum strength without being hostile. */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a digit");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("A valid email address is required")
  .max(254);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

/** Refresh/logout authenticate with the HttpOnly refresh cookie, not JSON. */
export const refreshSchema = z.object({});
export const logoutSchema = z.object({});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
