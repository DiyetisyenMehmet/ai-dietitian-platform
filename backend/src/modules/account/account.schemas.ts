import { z } from "zod";

/**
 * Zod schemas and derived DTO types for the account-lifecycle module.
 *
 * The password policy mirrors the auth module's registration policy so a
 * password chosen via reset/change is held to the same strength requirements.
 */

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a digit");

const emailSchema = z.string().trim().toLowerCase().email("A valid email address is required").max(254);

const tokenSchema = z.string().min(1, "token is required").max(512);

/** Confirm an email address using a verification token. */
export const verifyEmailSchema = z.object({
  token: tokenSchema,
});

/** Request a password-reset link for an email address. */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/** Complete a password reset with a valid token and a new password. */
export const resetPasswordSchema = z.object({
  token: tokenSchema,
  newPassword: passwordSchema,
});

/** Change the password of an authenticated user. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(128),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

/**
 * Password confirmation for destructive account actions (deletion request and
 * permanent deletion). Re-authenticating with the password prevents a stolen
 * access token alone from destroying an account.
 */
export const confirmPasswordSchema = z.object({
  password: z.string().min(1, "Password is required").max(128),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ConfirmPasswordInput = z.infer<typeof confirmPasswordSchema>;
