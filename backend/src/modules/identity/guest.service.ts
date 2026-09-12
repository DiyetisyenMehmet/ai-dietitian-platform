import crypto from "node:crypto";

import { authRepository } from "../auth/auth.repository";
import { issueIdentitySession } from "./session.service";
import type { IdentityRequestContext, IdentitySessionResult } from "./identity.types";

export const guestService = {
  async create(context: IdentityRequestContext): Promise<IdentitySessionResult> {
    const guestId = crypto.randomUUID();
    const user = await authRepository.createUser({
      email: `guest.${guestId}@guest.diewish.invalid`,
      passwordHash: "guest-account-has-no-password",
    });
    return issueIdentitySession(user, context, { isGuest: true });
  },
};
