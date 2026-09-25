import { z } from "zod";

import { normalizePhoneNumber } from "@/infrastructure/identity/phone-number";

const adminEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email();

export type AdminIdentifier =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string };

export function classifyAdminIdentifier(input: string): AdminIdentifier | null {
  const value = input.trim();
  if (!value) return null;

  // Phone is resolved first so +90/05xx/5xx inputs cannot fall through to an
  // unrelated text path. Explicit international prefixes remain supported.
  const phone = normalizePhoneNumber(value, "TR");
  if (phone) {
    return { kind: "phone", value: phone };
  }

  const email = adminEmailSchema.safeParse(value);
  if (email.success) {
    return { kind: "email", value: email.data };
  }

  return null;
}
