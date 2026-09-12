import { z } from "zod";

export const guestConversionSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
  fullName: z.string().trim().min(1).max(120).optional(),
});

export type GuestConversionInput = z.infer<typeof guestConversionSchema>;
