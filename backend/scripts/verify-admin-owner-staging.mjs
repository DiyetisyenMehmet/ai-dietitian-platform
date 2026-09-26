import { createHash } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  if (process.env.DIEWISH_ENVIRONMENT !== "staging") {
    throw new Error("Owner verification is staging-only.");
  }

  const expectedHash = process.env.ADMIN_BOOTSTRAP_EMAIL_SHA256?.trim().toLowerCase();
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error("A valid owner email fingerprint is required.");
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, isActive: true },
  });
  const matches = users.filter(
    (user) => user.email && sha256(user.email.trim().toLowerCase()) === expectedHash,
  );

  if (matches.length !== 1) {
    throw new Error(`Owner verification expected one account; found ${matches.length}.`);
  }

  const owner = matches[0];
  if (!owner.isActive || owner.role !== UserRole.ADMIN) {
    throw new Error("Owner account is not active ADMIN.");
  }

  const superRole = await prisma.adminRole.findUnique({
    where: { key: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!superRole) throw new Error("SUPER_ADMIN role is missing.");

  const membership = await prisma.adminUserRole.findUnique({
    where: {
      userId_roleId: {
        userId: owner.id,
        roleId: superRole.id,
      },
    },
    select: { userId: true },
  });
  if (!membership) throw new Error("Owner SUPER_ADMIN membership is missing.");

  const audit = await prisma.adminAuditEvent.findFirst({
    where: {
      actorAdminId: owner.id,
      action: "admin.bootstrap.super_admin",
      environment: "staging",
    },
    select: { id: true, riskLevel: true },
  });
  if (!audit) throw new Error("Owner bootstrap audit event is missing.");

  console.log(JSON.stringify({
    status: "verified",
    role: owner.role,
    active: owner.isActive,
    superAdmin: true,
    audit: true,
    riskLevel: audit.riskLevel,
  }));
}

void main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exitCode = 1;
  });
