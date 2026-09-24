import { PrismaClient } from "@prisma/client";

import { ensureAdminFoundation } from "./admin.foundation";

const prisma = new PrismaClient();

/**
 * DB-only staging/build seed. This deliberately does not import the normal
 * application env validator and therefore does not require JWT/auth secrets.
 */
async function main(): Promise<void> {
  await prisma.$transaction((tx) => ensureAdminFoundation(tx));
}

void main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exitCode = 1;
  });
