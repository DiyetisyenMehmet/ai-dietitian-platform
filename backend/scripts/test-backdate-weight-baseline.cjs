"use strict";

const { PrismaClient } = require("@prisma/client");

const CONFIRMATION = "DIEWISH_TEST_BACKDATE_WEIGHT_BASELINE";

async function main() {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DIEWISH_ENVIRONMENT !== "test" ||
    process.env.DIEWISH_TEST_FIXTURE_CONFIRM !== CONFIRMATION
  ) {
    throw new Error("Weight baseline fixture is test-only and requires explicit confirmation.");
  }

  const email = process.env.DIEWISH_TEST_FIXTURE_EMAIL?.trim().toLowerCase();
  const dateKey = process.env.DIEWISH_TEST_FIXTURE_DATE?.trim();
  if (!email || !dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Fixture requires a valid email and YYYY-MM-DD date.");
  }

  const loggedAt = new Date(`${dateKey}T12:00:00.000Z`);
  if (!Number.isFinite(loggedAt.getTime())) {
    throw new Error("Fixture date is invalid.");
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      throw new Error("Fixture user was not found.");
    }

    const result = await prisma.weightLog.updateMany({
      where: { userId: user.id, note: "Başlangıç" },
      data: { loggedAt },
    });
    if (result.count !== 1) {
      throw new Error(`Expected exactly one onboarding baseline, updated ${result.count}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
