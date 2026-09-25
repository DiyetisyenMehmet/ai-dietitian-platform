import { createHash } from "node:crypto";

import {
  AdminAuditRiskLevel,
  PrismaClient,
  UserRole,
} from "@prisma/client";

import { ensureAdminFoundation } from "./admin.foundation";
import { ADMIN_SYSTEM_ROLES } from "./admin.permissions";

const CONFIRMATION = "DIEWISH_STAGING_ADMIN_BOOTSTRAP";
const prisma = new PrismaClient();

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedEmailHash(email: string): string {
  return sha256(email.trim().toLowerCase());
}

function bootstrapExitCode(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Approved staging user does not exist")) return 51;
  if (message.includes("Approved staging user is inactive")) return 52;
  if (message.includes("Approved staging user fingerprint is not unique")) return 53;
  if (message.includes("different staging Super Admin")) return 42;
  if (message.includes("already been consumed")) return 43;
  if (message.includes("missing its required audit event")) return 44;
  if (message.includes("Post-bootstrap verification failed")) return 45;
  return 49;
}

async function main(): Promise<void> {
  if (process.env.DIEWISH_ENVIRONMENT !== "staging") {
    throw new Error("First Super Admin bootstrap is staging-only.");
  }

  if (process.env.ADMIN_BOOTSTRAP_CONFIRM !== CONFIRMATION) {
    throw new Error("Explicit staging bootstrap confirmation is required.");
  }

  const expectedHash = process.env.ADMIN_BOOTSTRAP_EMAIL_SHA256?.trim().toLowerCase();
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error("A valid ADMIN_BOOTSTRAP_EMAIL_SHA256 is required.");
  }

  const candidates = await prisma.user.findMany({
    select: { id: true, email: true, role: true, isActive: true },
  });
  const matches = candidates.filter(
    (user) => user.email && normalizedEmailHash(user.email) === expectedHash,
  );

  if (matches.length === 0) {
    throw new Error("Approved staging user does not exist.");
  }
  if (matches.length > 1) {
    throw new Error("Approved staging user fingerprint is not unique.");
  }

  const target = matches[0];
  if (!target.isActive) {
    throw new Error("Approved staging user is inactive.");
  }

  const result = await prisma.$transaction(async (tx) => {
    await ensureAdminFoundation(tx);

    const superRole = await tx.adminRole.findUniqueOrThrow({
      where: { key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
      select: { id: true },
    });

    const existingMembership = await tx.adminUserRole.findUnique({
      where: {
        userId_roleId: {
          userId: target.id,
          roleId: superRole.id,
        },
      },
      select: { userId: true },
    });
    const existingAudit = await tx.adminAuditEvent.findFirst({
      where: {
        actorAdminId: target.id,
        action: "admin.bootstrap.super_admin",
        environment: "staging",
      },
      select: { id: true },
    });

    if (existingMembership && target.role === UserRole.ADMIN) {
      if (!existingAudit) {
        throw new Error("Existing Super Admin assignment is missing its required audit event.");
      }
      return "already-configured" as const;
    }

    const anotherSuperAdmin = await tx.adminUserRole.findFirst({
      where: {
        roleId: superRole.id,
        userId: { not: target.id },
      },
      select: { userId: true },
    });
    if (anotherSuperAdmin) {
      throw new Error("A different staging Super Admin already exists; first-admin bootstrap is closed.");
    }

    const consumed = await tx.adminAuditEvent.findFirst({
      where: {
        action: "admin.bootstrap.super_admin",
        environment: "staging",
      },
      select: { id: true },
    });
    if (consumed) {
      throw new Error("The one-time staging Super Admin bootstrap has already been consumed.");
    }

    await tx.user.update({
      where: { id: target.id },
      data: { role: UserRole.ADMIN },
    });
    await tx.adminUserRole.upsert({
      where: {
        userId_roleId: {
          userId: target.id,
          roleId: superRole.id,
        },
      },
      update: { assignedByAdminId: target.id },
      create: {
        userId: target.id,
        roleId: superRole.id,
        assignedByAdminId: target.id,
      },
    });
    await tx.adminAuditEvent.create({
      data: {
        actorAdminId: target.id,
        action: "admin.bootstrap.super_admin",
        targetType: "user",
        targetId: target.id,
        beforeState: {
          role: target.role,
          isActive: target.isActive,
        },
        afterState: {
          role: UserRole.ADMIN,
          assignedRole: ADMIN_SYSTEM_ROLES.SUPER_ADMIN,
        },
        reason: "Explicit non-production Management Center bootstrap",
        environment: "staging",
        correlationId: "bootstrap",
        requestId: "bootstrap",
        riskLevel: AdminAuditRiskLevel.HIGH,
      },
    });

    return "bootstrapped" as const;
  });

  const superRole = await prisma.adminRole.findUniqueOrThrow({
    where: { key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
    select: { id: true },
  });
  const verifiedUser = await prisma.user.findUniqueOrThrow({
    where: { id: target.id },
    select: { role: true, isActive: true },
  });
  const verifiedMembership = await prisma.adminUserRole.findUnique({
    where: {
      userId_roleId: {
        userId: target.id,
        roleId: superRole.id,
      },
    },
    select: { userId: true },
  });
  const verifiedAudit = await prisma.adminAuditEvent.findFirst({
    where: {
      actorAdminId: target.id,
      action: "admin.bootstrap.super_admin",
      environment: "staging",
    },
    select: { id: true },
  });

  if (
    verifiedUser.role !== UserRole.ADMIN ||
    !verifiedUser.isActive ||
    !verifiedMembership ||
    !verifiedAudit
  ) {
    throw new Error("Post-bootstrap verification failed.");
  }

  console.log(
    JSON.stringify({
      userId: target.id,
      role: verifiedUser.role,
      superAdmin: true,
      auditEvent: true,
      status: result,
    }),
  );
}

void main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exitCode = bootstrapExitCode(error);
  });
