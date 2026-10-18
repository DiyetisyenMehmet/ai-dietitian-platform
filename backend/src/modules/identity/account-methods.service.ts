import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";

export const accountMethodsService = {
  async getForUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        deletionRequestedAt: true,
        email: true,
        emailVerifiedAt: true,
        hasUsablePassword: true,
        accountIdentities: { select: { kind: true } },
      },
    });
    if (!user?.isActive) throw ApiError.unauthorized("Session is no longer valid.");
    if (
      user.role !== "USER" ||
      user.email.endsWith("@guest.diewish.invalid") ||
      user.deletionRequestedAt
    ) {
      throw ApiError.forbidden("Account methods are unavailable for this account.");
    }
    const has = (kind: "EMAIL" | "PHONE" | "GOOGLE") =>
      user.accountIdentities.some((identity) => identity.kind === kind);
    const legacyEmail = !user.email.endsWith(".diewish.invalid");
    return {
      userId: user.id,
      email: {
        verification: has("EMAIL")
          ? "VERIFIED"
          : legacyEmail
            ? user.emailVerifiedAt
              ? "VERIFIED"
              : "UNVERIFIED"
            : "NOT_SET",
        source: has("EMAIL") ? "REGISTRY" : legacyEmail ? "LEGACY" : "NONE",
      },
      // No evidence of a link is not evidence that a legacy link never existed.
      phone: { verified: has("PHONE") ? true : null },
      google: { linked: has("GOOGLE") ? true : null },
      diewishPassword: { usable: user.hasUsablePassword },
      // Metadata only; no new sign-in, recovery or linking permission is granted.
      linkingEnabled: false,
    };
  },
};
