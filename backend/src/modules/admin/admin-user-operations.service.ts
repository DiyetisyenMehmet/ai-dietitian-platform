import { AdminAuditRiskLevel, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { buildAuditSnapshot, runAuditedAdminMutation } from "./admin-audit.service";
import { resolveRuntimeEnvironment } from "./admin.environment";

interface OperationContext {
  actorAdminId: string;
  requestId: string;
}
const conflict = () =>
  new ApiError(409, "Account or session state changed. Reload before retrying.", {
    code: "ADMIN_USER_STATE_CHANGED",
  });

async function requireUser(db: Prisma.TransactionClient, id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true, deactivatedAt: true },
  });
  if (!user) throw ApiError.notFound("User not found.");
  // Never bypass staff/Super Admin safeguards through the consumer-user API.
  if (user.role !== UserRole.USER)
    throw ApiError.forbidden("Administrator accounts must use staff management.");
  return user;
}
function audit(context: OperationContext, userId: string, action: string, reason: string) {
  if (reason.trim().length < 3 || reason.trim().length > 500)
    throw ApiError.badRequest("A reason is required.");
  return {
    ...context,
    correlationId: context.requestId,
    action,
    targetType: "user",
    targetId: userId,
    reason: reason.trim(),
    environment: resolveRuntimeEnvironment(),
    riskLevel: AdminAuditRiskLevel.HIGH,
  };
}

// Raw user-agent strings are client-controlled: expose only a coarse device label.
function deviceLabel(agent: string | null) {
  if (!agent) return "Cihaz bilgisi yok";
  const os = /Android/i.test(agent)
    ? "Android"
    : /iPhone|iPad/i.test(agent)
      ? "iOS"
      : /Windows/i.test(agent)
        ? "Windows"
        : /Macintosh/i.test(agent)
          ? "macOS"
          : /Linux/i.test(agent)
            ? "Linux"
            : "Diğer cihaz";
  const browser = /Edg\//i.test(agent)
    ? "Edge"
    : /Firefox\//i.test(agent)
      ? "Firefox"
      : /Chrome\//i.test(agent)
        ? "Chrome"
        : /Safari\//i.test(agent)
          ? "Safari"
          : "Uygulama";
  return `${os} · ${browser}`;
}
export const ADMIN_USER_SESSION_SELECT = {
  id: true,
  createdAt: true,
  expiresAt: true,
  userAgent: true,
} satisfies Prisma.RefreshTokenSelect;

// Claim the active refresh record, following rotation successors under contention.
// The conditional update races safely with authRepository.rotateRefreshToken: only
// one can claim a record. If rotation wins, revoke its successor, not an obsolete ID.
async function revokeChain(tx: Prisma.TransactionClient, userId: string, id: string) {
  let current = id;
  for (let hop = 0; hop < 20; hop++) {
    const row = await tx.refreshToken.findFirst({
      where: { id: current, userId },
      select: { id: true, revokedAt: true, expiresAt: true, replacedById: true },
    });
    if (!row) throw ApiError.notFound("Session not found.");
    if (row.replacedById) {
      current = row.replacedById;
      continue;
    }
    if (row.revokedAt || row.expiresAt <= new Date()) return null;
    const claimed = await tx.refreshToken.updateMany({
      where: { id: row.id, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 1) return row.id;
  }
  throw conflict();
}

export const adminUserOperationsService = {
  async sessions(userId: string) {
    await requireUser(prisma, userId);
    const where = { userId, revokedAt: null, expiresAt: { gt: new Date() } };
    const [rows, total] = await prisma.$transaction(
      [
        prisma.refreshToken.findMany({
          where,
          select: ADMIN_USER_SESSION_SELECT,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 50,
        }),
        prisma.refreshToken.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      sessions: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        device: deviceLabel(row.userAgent),
      })),
      total,
    };
  },
  async status(context: OperationContext, userId: string, isActive: boolean, reason: string) {
    return runAuditedAdminMutation(
      audit(context, userId, "admin.users.status_update", reason),
      async (tx) => {
        const before = await requireUser(tx, userId);
        if (before.isActive === isActive) throw conflict();
        const changed = await tx.user.updateMany({
          where: { id: userId, role: UserRole.USER, isActive: !isActive },
          data: { isActive, deactivatedAt: null },
        });
        if (changed.count !== 1) throw conflict();
        return {
          result: { id: userId, isActive },
          before: buildAuditSnapshot(
            { isActive: before.isActive, selfDeactivated: Boolean(before.deactivatedAt) },
            ["isActive", "selfDeactivated"],
          ),
          after: buildAuditSnapshot({ isActive, selfDeactivated: false }, [
            "isActive",
            "selfDeactivated",
          ]),
        };
      },
    );
  },
  async revoke(context: OperationContext, userId: string, sessionId: string, reason: string) {
    return runAuditedAdminMutation(
      audit(context, userId, "admin.users.session_revoke", reason),
      async (tx) => {
        await requireUser(tx, userId);
        const revokedId = await revokeChain(tx, userId, sessionId);
        if (!revokedId) throw conflict();
        return {
          result: { revoked: true },
          before: buildAuditSnapshot({ sessionId: revokedId, active: true }, [
            "sessionId",
            "active",
          ]),
          after: buildAuditSnapshot({ sessionId: revokedId, active: false }, [
            "sessionId",
            "active",
          ]),
        };
      },
    );
  },
  async revokeAll(context: OperationContext, userId: string, reason: string) {
    return runAuditedAdminMutation(
      audit(context, userId, "admin.users.sessions_revoke_all", reason),
      async (tx) => {
        await requireUser(tx, userId);
        const rows = await tx.refreshToken.findMany({
          where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
        });
        let revokedCount = 0;
        for (const row of rows) if (await revokeChain(tx, userId, row.id)) revokedCount++;
        if (!revokedCount) throw conflict();
        return {
          result: { revokedCount },
          before: buildAuditSnapshot({ affectedActiveSessions: revokedCount }, [
            "affectedActiveSessions",
          ]),
          after: buildAuditSnapshot({ affectedActiveSessions: 0, revokedCount }, [
            "affectedActiveSessions",
            "revokedCount",
          ]),
        };
      },
    );
  },
};
