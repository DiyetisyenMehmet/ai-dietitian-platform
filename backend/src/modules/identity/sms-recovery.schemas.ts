import { z } from "zod";
import { resetPasswordSchema } from "../account/account.schemas";
import { phoneNumberSchema } from "./phone-password.schemas";
export const smsRecoveryBeginSchema = z.object({ phoneNumber: phoneNumberSchema }).strict();
export const smsRecoveryVerifySchema = z
  .object({ idToken: z.string().min(20).max(16000) })
  .strict();
export const smsRecoveryCompleteSchema = z
  .object({
    newPassword: resetPasswordSchema.shape.newPassword.refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Password must be at most 72 UTF-8 bytes",
    ),
    passwordConfirmation: z.string().min(1).max(128),
  })
  .strict()
  .refine((value) => value.newPassword === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords must match",
  });
