import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { verifyPassword } from "../../utils/password";
import { authRepository } from "../auth/auth.repository";
import { issueAuthSession, type AuthResult, type SessionContext } from "../auth/auth.service";

export const reactivationService = {
  async withPassword(
    email: string,
    password: string,
    context: SessionContext,
  ): Promise<AuthResult> {
    const user = await authRepository.findUserByEmail(email);
    const invalid = ApiError.unauthorized("Invalid email or password.");
    if (!user || !(await verifyPassword(password, user.passwordHash))) throw invalid;

    if (user.isActive) {
      await authRepository.updateLastLogin(user.id);
      return issueAuthSession(user, context);
    }
    if (!user.deactivatedAt) {
      throw ApiError.forbidden("This account cannot be reactivated.");
    }

    const changed = await prisma.user.updateMany({
      where: { id: user.id, isActive: false, deactivatedAt: { not: null } },
      data: { isActive: true, deactivatedAt: null },
    });
    if (changed.count !== 1) throw ApiError.forbidden("This account cannot be reactivated.");
    const reactivated = (await authRepository.findUserById(user.id))!;
    await authRepository.updateLastLogin(user.id);
    return issueAuthSession(reactivated, context);
  },
};
