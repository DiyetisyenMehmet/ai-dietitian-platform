import { z } from "zod";

const adminEmailSchema = z.string().trim().toLowerCase().email("A valid email address is required").max(254);
const currentPasswordSchema = z.string().min(1, "Current password is required").max(128);
const newAdminPasswordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a digit")
  .regex(/[^A-Za-z0-9]/, "Password must contain a symbol");

export const adminEmailLoginSchema = z.object({
  email: adminEmailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

export const adminBootstrapSchema = z.object({
  idToken: z.string().trim().min(20, "Identity token is required").max(16_000),
  password: newAdminPasswordSchema,
});

export const adminForgotPasswordSchema = z.object({
  email: adminEmailSchema,
});

export const adminResetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  newPassword: newAdminPasswordSchema,
});

export const adminEmailChangeSchema = z.object({
  currentPassword: currentPasswordSchema,
  newEmail: adminEmailSchema,
});

export const adminPasswordChangeSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: newAdminPasswordSchema,
}).refine((value) => value.currentPassword !== value.newPassword, {
  path: ["newPassword"],
  message: "New password must be different from the current password",
});

export type AdminEmailLoginInput = z.infer<typeof adminEmailLoginSchema>;
export type AdminBootstrapInput = z.infer<typeof adminBootstrapSchema>;
export type AdminForgotPasswordInput = z.infer<typeof adminForgotPasswordSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type AdminEmailChangeInput = z.infer<typeof adminEmailChangeSchema>;
export type AdminPasswordChangeInput = z.infer<typeof adminPasswordChangeSchema>;
