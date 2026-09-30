import type { AdminSupportEntitlement, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export function supportEntitlementStatus(
  row: Pick<AdminSupportEntitlement, "expiresAt" | "revokedAt">,
  now = new Date(),
): "ACTIVE" | "EXPIRED" | "REVOKED" {
  if (row.revokedAt) return "REVOKED";
  if (row.expiresAt && row.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

export async function findSupportEntitlementForUser(
  userId: string,
  db: Db = prisma,
): Promise<AdminSupportEntitlement | null> {
  return db.adminSupportEntitlement.findUnique({ where: { userId } });
}

export async function findActiveSupportEntitlementForUser(
  userId: string,
  db: Db = prisma,
  now = new Date(),
): Promise<AdminSupportEntitlement | null> {
  return db.adminSupportEntitlement.findFirst({
    where: {
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}
