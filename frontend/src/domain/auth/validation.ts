import { z } from "zod";

/**
 * Auth validation schemas — single source of truth for client-side
 * input validation. Framework-agnostic (Zod only); consumed by forms
 * and the application service layer.
 */

const email = z
  .string()
  .min(1, "E-posta adresi gereklidir.")
  .email("Geçerli bir e-posta adresi girin.");

const password = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalıdır.")
  .max(128, "Şifre en fazla 128 karakter olabilir.");

/** Strong password rules used for account creation and reset. */
const strongPassword = password
  .regex(/[a-z]/, "Şifre en az bir küçük harf içermelidir.")
  .regex(/[A-Z]/, "Şifre en az bir büyük harf içermelidir.")
  .regex(/[0-9]/, "Şifre en az bir rakam içermelidir.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Şifre gereklidir."),
  rememberMe: z.boolean().default(false),
});

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .min(1, "Ad soyad gereklidir.")
      .min(2, "Ad soyad en az 2 karakter olmalıdır.")
      .max(80, "Ad soyad en fazla 80 karakter olabilir."),
    email,
    password: strongPassword,
    confirmPassword: z.string().min(1, "Şifre tekrarı gereklidir."),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "Devam etmek için koşulları kabul etmelisiniz." }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Şifreler eşleşmiyor.",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string().min(1, "Şifre tekrarı gereklidir."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Şifreler eşleşmiyor.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
