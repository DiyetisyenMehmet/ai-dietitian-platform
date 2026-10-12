// Isolated existing-CI PostgreSQL ONLY. Never an operational role provisioning script.
import crypto from "node:crypto";
import { Client } from "pg";
import { env } from "../../config/env";
import { COACH_LISTENER_ROLE, sameCoachDatabase } from "../../modules/ai-chat/coach-events";

export async function prepareCoachListenerFixture(): Promise<{
  url: string;
  cleanup: () => Promise<void>;
}> {
  const url = new URL(env.DATABASE_URL);
  url.username = COACH_LISTENER_ROLE;
  if (
    env.NODE_ENV !== "test" ||
    env.DIEWISH_ENVIRONMENT !== "test" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !["/diewish_test", "/diewish_e2e"].includes(url.pathname) ||
    !sameCoachDatabase(env.DATABASE_URL, url.toString())
  )
    throw new Error("Restricted listener fixture requires the isolated CI database");
  const owner = new Client({ connectionString: env.DATABASE_URL });
  await owner.connect();
  try {
    // Hex-only generated fixture credential, never a staging secret or a logged URL.
    const password = crypto.randomBytes(24).toString("hex");
    await owner.query(`CREATE ROLE ${COACH_LISTENER_ROLE} LOGIN NOINHERIT NOSUPERUSER
      NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
    // Public CONNECT is sufficient for LISTEN. No schema/table/sequence grants.
    url.username = COACH_LISTENER_ROLE;
    url.password = password;
    return {
      url: url.toString(),
      cleanup: async () => {
        const connection = new Client({ connectionString: env.DATABASE_URL });
        await connection.connect();
        try {
          await connection.query(`DROP ROLE ${COACH_LISTENER_ROLE}`);
        } finally {
          await connection.end();
        }
      },
    };
  } finally {
    await owner.end();
  }
}

if (require.main === module) {
  // Persist only in the ephemeral runner environment; never output a credential.
  void (async () => {
    const fs = await import("node:fs/promises");
    const destination = process.env.GITHUB_ENV;
    if (!destination || process.env.CI !== "true")
      throw new Error("Fixture entry point requires the existing GitHub CI runner");
    const fixture = await prepareCoachListenerFixture();
    console.log(`::add-mask::${fixture.url}`);
    await fs.appendFile(destination, `COACH_SYNC_DATABASE_URL=${fixture.url}\n`);
  })().catch(() => {
    console.error("Restricted CI listener preparation failed");
    process.exitCode = 1;
  });
}
