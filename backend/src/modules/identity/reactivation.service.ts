import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { verifyPassword } from "../../utils/password";
import { authRepository } from "../auth/auth.repository";
import { issueAuthSession, type AuthResult, type SessionContext } from "../auth/auth.service";

async function getDeactivatedAt(userId: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ deactivatedAt: Date | null }>>`
    SELECT "deactivatedAt" FROM "users" WHERE "id" = ${userId} LIMIT 1
  `;
  return rows[0]?.deactivatedAt ?? null;
}

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
    if (!(await getDeactivatedAt(user.id))) {
      throw ApiError.forbidden("This account cannot be reactivated.");
    }

    await prisma.$executeRaw`
      UPDATE "users" SET "isActive" = true, "deactivatedAt" = NULL WHERE "id" = ${user.id}
    `;
    const reactivated = (await authRepository.findUserById(user.id))!;
    await authRepository.updateLastLogin(user.id);
    return issueAuthSession(reactivated, context);
  },
};
