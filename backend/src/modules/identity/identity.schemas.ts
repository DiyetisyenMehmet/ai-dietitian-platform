import { z } from "zod";

export const externalLoginSchema = z.object({
  idToken: z.string().min(20).max(16_000),
});

export const deactivateSchema = z.object({
  confirm: z.literal(true),
});

export const sessionParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ExternalLoginInput = z.infer<typeof externalLoginSchema>;
