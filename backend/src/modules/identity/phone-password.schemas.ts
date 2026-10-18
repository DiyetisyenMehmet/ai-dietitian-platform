import { z } from "zod";
import { registerSchema } from "../auth/auth.schemas";

export const phoneNumberSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);
// The existing Diewish policy and verifier remain authoritative. Bcrypt ignores
// bytes beyond 72, so a new credential must never silently truncate Unicode.
const password = registerSchema.shape.password.refine(
  (value) => Buffer.byteLength(value, "utf8") <= 72,
  "Password must be at most 72 UTF-8 bytes",
);
export const phonePasswordStartSchema = z
  .object({
    phoneNumber: phoneNumberSchema,
    idToken: z.string().min(20).max(16_000),
  })
  .strict();
export const phonePasswordCompleteSchema = z
  .object({
    password,
    passwordConfirmation: z.string().min(1).max(128),
  })
  .strict()
  .refine((input) => input.password === input.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords must match",
  });
export const phonePasswordLoginSchema = z
  .object({
    phoneNumber: phoneNumberSchema,
    password: z
      .string()
      .min(1)
      .max(128)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 72),
  })
  .strict();
