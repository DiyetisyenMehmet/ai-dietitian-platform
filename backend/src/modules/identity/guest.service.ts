import crypto from "node:crypto";

import { prisma } from "../../lib/prisma";
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
    await prisma.$executeRaw`UPDATE "users" SET "isGuest" = true WHERE "id" = ${user.id}`;
    return issueIdentitySession(user, context, { isGuest: true });
  },
};
