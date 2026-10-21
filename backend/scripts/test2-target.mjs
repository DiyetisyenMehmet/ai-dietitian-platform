import { randomBytes } from "node:crypto";
import { URL } from "node:url";

export const TARGET = Object.freeze({
  project: "misty-forest-09137357",
  branch: "br-nameless-meadow-ba07cyg3",
  host: "ep-sweet-glitter-bafgdm9p.c-8.eu-central-1.aws.neon.tech",
  database: "diewish_staging_test2",
  role: "diewish_staging_test2_owner",
});

// No fallback to a developer's existing DATABASE_URL or a serving environment.
export function validateTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("An explicit Test 2 connection file is required.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== TARGET.host ||
    !["", "5432"].includes(url.port) ||
    url.pathname !== `/${TARGET.database}` ||
    decodeURIComponent(url.username) !== TARGET.role ||
    !url.password ||
    url.hash ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode"))
  ) {
    throw new Error("Refusing a connection outside the exact direct Test 2 target.");
  }
  const allowed = new Set(["sslmode", "channel_binding", "schema", "connect_timeout"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error("Refusing an unexpected connection option.");
    }
  }
  if (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") {
    throw new Error("Only the public schema is supported.");
  }
  return url.toString();
}

export function isolatedEnvironment(databaseUrl, inherited = {}) {
  const result = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"]) {
    if (inherited[key]) result[key] = inherited[key];
  }
  return {
    ...result,
    DATABASE_URL: validateTarget(databaseUrl),
    NODE_ENV: "test",
    DIEWISH_ENVIRONMENT: "test",
    LOG_LEVEL: "silent",
    ENABLE_API_DOCS: "false",
    TRUST_PROXY_HOPS: "0",
    CORS_ORIGIN: "http://127.0.0.1:3000",
    APP_WEB_URL: "http://127.0.0.1:3000",
    JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
    JWT_REFRESH_SECRET: randomBytes(48).toString("hex"),
    ACCOUNT_SAFE_LINKING_ENABLED: "false",
    PHONE_PASSWORD_AUTH_ENABLED: "false",
    PHONE_SMS_RECOVERY_ENABLED: "false",
    COACH_SYNC_ENABLED: "false",
    STAGING_AUTOMATION_ENABLED: "false",
    NUTRITION_JOBS_ENABLED: "false",
    SCHEDULER_TRIGGER_ENABLED: "false",
    STORAGE_PROVIDER: "local",
    CHECKPOINT_DISABLE: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    DO_NOT_TRACK: "1",
    SCARF_ANALYTICS: "false",
  };
}
