import { z } from "zod";
const idToken = z.string().min(20).max(16_000);
const token = z.string().min(20).max(512);
export const accountLinkStartSchema = z
  .object({
    kind: z.enum(["EMAIL", "PHONE", "GOOGLE"]),
    identifier: z.string().min(1).max(320),
    reauthentication: z.union([
      z.object({ password: z.string().min(1).max(128) }).strict(),
      z.object({ idToken }).strict(),
    ]),
  })
  .strict();
export const accountLinkCompleteSchema = z
  .object({ operationId: z.string().uuid(), token: token.optional(), idToken: idToken.optional() })
  .strict();
export const googleTransitionStartSchema = z.object({ idToken }).strict();
export const googleTransitionCompleteSchema = z
  .object({ operationId: z.string().uuid(), token, idToken })
  .strict();
