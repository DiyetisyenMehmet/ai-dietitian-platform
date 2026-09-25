import { z } from "zod";

const adminEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("A valid email address is required")
  .max(254);

export const adminEmailLoginSchema = z.object({
  email: adminEmailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

export const adminPhoneLoginSchema = z.object({
  idToken: z.string().trim().min(20, "Identity token is required").max(10_000),
});

export type AdminEmailLoginInput = z.infer<typeof adminEmailLoginSchema>;
export type AdminPhoneLoginInput = z.infer<typeof adminPhoneLoginSchema>;
