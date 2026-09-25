import { createHash } from "node:crypto";

import { prisma } from "../../lib/prisma";
import { resolveRuntimeEnvironment } from "./admin.environment";
import { bootstrapStagingSuperAdmin } from "./admin.bootstrap";
import { ADMIN_SYSTEM_ROLES } from "./admin.permissions";

const CONFIRMATION = "DIEWISH_STAGING_ADMIN_BOOTSTRAP";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedEmailHash(email: string): string {
  return sha256(email.trim().toLowerCase());
}

async function main(): Promise<void> {
  const environment = resolveRuntimeEnvironment();
  if (environment !== "staging") {
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
    where: { isActive: true },
    select: { id: true, email: true, role: true, isActive: true },
  });
  const matches = candidates.filter(
    (user) => user.email && normalizedEmailHash(user.email) === expectedHash,
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one active staging user matching the approved email fingerprint; found ${matches.length}.`,
    );
  }

  const target = matches[0];
  const superRole = await prisma.adminRole.findUnique({
    where: { key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
    select: { id: true },
  });

  if (superRole) {
    const alreadyAssigned = await prisma.adminUserRole.findUnique({
      where: {
        userId_roleId: {
          userId: target.id,
          roleId: superRole.id,
        },
      },
      select: { userId: true },
    });

    if (alreadyAssigned && target.role === "ADMIN") {
      const auditExists = await prisma.adminAuditEvent.findFirst({
        where: {
          actorAdminId: target.id,
          action: "admin.bootstrap.super_admin",
          environment: "staging",
        },
        select: { id: true },
      });
      if (!auditExists) {
        throw new Error("Existing Super Admin assignment is missing its required audit event.");
      }
      console.log(
        JSON.stringify({
          userId: target.id,
          role: "ADMIN",
          superAdmin: true,
          auditEvent: true,
          status: "already-configured",
        }),
      );
      return;
    }

    const anotherSuperAdmin = await prisma.adminUserRole.findFirst({
      where: {
        roleId: superRole.id,
        userId: { not: target.id },
      },
      select: { userId: true },
    });
    if (anotherSuperAdmin) {
      throw new Error("A different staging Super Admin already exists; first-admin bootstrap is closed.");
    }
  }

  const consumed = await prisma.adminAuditEvent.findFirst({
    where: {
      action: "admin.bootstrap.super_admin",
      environment: "staging",
    },
    select: { id: true },
  });
  if (consumed) {
    throw new Error("The one-time staging Super Admin bootstrap has already been consumed.");
  }

  await bootstrapStagingSuperAdmin(target.id);

  const verifiedUser = await prisma.user.findUniqueOrThrow({
    where: { id: target.id },
    select: { role: true, isActive: true },
  });
  const verifiedRole = await prisma.adminRole.findUniqueOrThrow({
    where: { key: ADMIN_SYSTEM_ROLES.SUPER_ADMIN },
    select: { id: true },
  });
  const verifiedMembership = await prisma.adminUserRole.findUnique({
    where: {
      userId_roleId: {
        userId: target.id,
        roleId: verifiedRole.id,
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
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (
    verifiedUser.role !== "ADMIN" ||
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
      status: "bootstrapped",
    }),
  );
}

function bootstrapExitCode(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Expected exactly one active staging user")) return 41;
  if (message.includes("different staging Super Admin")) return 42;
  if (message.includes("already been consumed")) return 43;
  if (message.includes("missing its required audit event")) return 44;
  if (message.includes("Post-bootstrap verification failed")) return 45;
  return 49;
}

void main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exitCode = bootstrapExitCode(error);
  });
