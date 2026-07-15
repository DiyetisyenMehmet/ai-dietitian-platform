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

/**
 * Refresh/logout accept the refresh token from the JSON body. (A future sprint
 * may additionally read it from an httpOnly cookie; the service layer is
 * agnostic to the transport.)
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
