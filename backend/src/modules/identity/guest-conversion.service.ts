import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { hashPassword } from "../../utils/password";
import { authRepository } from "../auth/auth.repository";
import { issueAuthSession, type AuthResult, type SessionContext } from "../auth/auth.service";
import type { GuestConversionInput } from "./guest-conversion.schemas";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const guestConversionService = {
  async convert(
    userId: string,
    input: GuestConversionInput,
    context: SessionContext,
  ): Promise<AuthResult> {
    const current = await authRepository.findUserById(userId);
    if (!current || !current.email.endsWith("@guest.diewish.invalid")) {
      throw ApiError.forbidden("Only guest accounts can use this conversion flow.");
    }

    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) throw ApiError.conflict("An account with this email already exists.");

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          email: input.email,
          passwordHash: await hashPassword(input.password),
          fullName: input.fullName ?? current.fullName,
        },
      });
      return issueAuthSession(user, context);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw ApiError.conflict("An account with this email already exists.");
      }
      throw error;
    }
  },
};
