import {
  AdminAuditRiskLevel,
  Prisma,
  UserRole,
  type AdminSupportEntitlement,
  type SubscriptionTier,
} from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import {
  buildAuditSnapshot,
  runAuditedAdminMutation,
} from "./admin-audit.service";
import { resolveRuntimeEnvironment } from "./admin.environment";
import { supportEntitlementStatus } from "../payments/support-entitlements.repository";

interface OperationContext {
  actorAdminId: string;
  requestId: string;
}

interface SupportMutationInput {
  tier: Exclude<SubscriptionTier, "FREE">;
  expiresAt: Date | null;
  expectedUpdatedAt: string | null;
  reason: string;
}

const conflict = () =>
  new ApiError(409, "Support entitlement state changed. Reload before retrying.", {
    code: "ADMIN_ENTITLEMENT_STATE_CHANGED",
  });

function audit(
  context: OperationContext,
  userId: string,
  action: string,
  reason: string,
) {
  if (reason.trim().length < 3 || reason.trim().length > 500) {
    throw ApiError.badRequest("A reason is required.");
  }
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

async function requireConsumerUser(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw ApiError.notFound("User not found.");
  if (user.role !== UserRole.USER) {
    throw ApiError.forbidden("Administrator accounts are not eligible for support entitlements.");
  }
  return user;
}

function assertExpiry(expiresAt: Date | null) {
  if (expiresAt && expiresAt <= new Date()) {
    throw ApiError.badRequest("Support entitlement expiry must be in the future.");
  }
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function snapshot(row: AdminSupportEntitlement | null, now = new Date()) {
  if (!row) {
    return buildAuditSnapshot(
      { source: "ADMIN_SUPPORT", supportStatus: "NONE" },
      ["source", "supportStatus"],
    );
  }
  return buildAuditSnapshot(
    {
      source: "ADMIN_SUPPORT",
      supportTier: row.tier,
      supportStatus: supportEntitlementStatus(row, now),
      supportExpiry: iso(row.expiresAt),
      supportUpdatedAt: row.updatedAt.toISOString(),
    },
    [
      "source",
      "supportTier",
      "supportStatus",
      "supportExpiry",
      "supportUpdatedAt",
    ],
  );
}

function toView(row: AdminSupportEntitlement) {
  return {
    id: row.id,
    tier: row.tier,
    status: supportEntitlementStatus(row),
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  };
}

function sameExpiry(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

function assertExpectedState(
  current: AdminSupportEntitlement | null,
  expectedUpdatedAt: string | null,
) {
  if (!current && expectedUpdatedAt === null) return;
  if (!current || expectedUpdatedAt === null) throw conflict();
  if (current.updatedAt.toISOString() !== expectedUpdatedAt) throw conflict();
}

export const adminEntitlementOperationsService = {
  async upsert(
    context: OperationContext,
    userId: string,
    input: SupportMutationInput,
  ) {
    assertExpiry(input.expiresAt);

    return runAuditedAdminMutation(
      audit(context, userId, "admin.entitlements.support_upsert", input.reason),
      async (tx) => {
        await requireConsumerUser(tx, userId);
        const now = new Date();
        const current = await tx.adminSupportEntitlement.findUnique({
          where: { userId },
        });
        assertExpectedState(current, input.expectedUpdatedAt);

        if (
          current &&
          supportEntitlementStatus(current, now) === "ACTIVE" &&
          current.tier === input.tier &&
          sameExpiry(current.expiresAt, input.expiresAt)
        ) {
          throw conflict();
        }

        const before = snapshot(current, now);
        let next: AdminSupportEntitlement;

        if (current) {
          const changed = await tx.adminSupportEntitlement.updateMany({
            where: {
              id: current.id,
              userId,
              updatedAt: current.updatedAt,
            },
            data: {
              tier: input.tier,
              expiresAt: input.expiresAt,
              revokedAt: null,
              grantedAt: now,
            },
          });
          if (changed.count !== 1) throw conflict();
          next = await tx.adminSupportEntitlement.findUniqueOrThrow({
            where: { userId },
          });
        } else {
          try {
            next = await tx.adminSupportEntitlement.create({
              data: {
                userId,
                tier: input.tier,
                expiresAt: input.expiresAt,
                grantedAt: now,
              },
            });
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ) {
              throw conflict();
            }
            throw error;
          }
        }

        return {
          result: { supportEntitlement: toView(next) },
          before,
          after: snapshot(next, now),
        };
      },
    );
  },

  async revoke(
    context: OperationContext,
    userId: string,
    expectedUpdatedAt: string,
    reason: string,
  ) {
    return runAuditedAdminMutation(
      audit(context, userId, "admin.entitlements.support_revoke", reason),
      async (tx) => {
        await requireConsumerUser(tx, userId);
        const now = new Date();
        const current = await tx.adminSupportEntitlement.findUnique({
          where: { userId },
        });
        assertExpectedState(current, expectedUpdatedAt);
        if (!current || supportEntitlementStatus(current, now) !== "ACTIVE") {
          throw conflict();
        }

        const changed = await tx.adminSupportEntitlement.updateMany({
          where: {
            id: current.id,
            userId,
            updatedAt: current.updatedAt,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        if (changed.count !== 1) throw conflict();

        const next = await tx.adminSupportEntitlement.findUniqueOrThrow({
          where: { userId },
        });

        return {
          result: { supportEntitlement: toView(next) },
          before: snapshot(current, now),
          after: snapshot(next, now),
        };
      },
    );
  },
};
