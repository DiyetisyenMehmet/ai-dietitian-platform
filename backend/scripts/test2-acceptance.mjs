import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { once } from "node:events";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { TARGET, isolatedEnvironment } from "./test2-target.mjs";

const backend = fileURLToPath(new URL("../", import.meta.url));
let stage = "configuration";
let prisma;
let server;
const checks = [];
function requireCheck(ok, label) {
  if (!ok) throw new Error(label);
}
function pass(name) {
  checks.push(name);
  console.log(`PASS: ${name}`);
}

try {
  const args = process.argv.slice(2);
  requireCheck(
    args[0] === "--connection-file" &&
      args[1] &&
      (args.length === 2 || (args.length === 3 && args[2] === "--migrate")),
    "Use --connection-file /private/connection.json [--migrate].",
  );
  const input = JSON.parse(readFileSync(resolve(args[1]), "utf8"));
  const isolated = isolatedEnvironment(input.DATABASE_URL, process.env);
  requireCheck(!existsSync(resolve(backend, ".env")), "Refusing an ambient backend .env file.");
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, isolated);
  process.chdir(backend);

  const { PrismaClient, Prisma } = await import("@prisma/client");
  prisma = new PrismaClient({ log: [] });
  stage = "database identity";
  const [identity] = await prisma.$queryRaw`
    SELECT current_database() AS name, current_user AS role,
           current_setting('server_version_num')::int AS version`;
  requireCheck(
    identity.name === TARGET.database && identity.role === TARGET.role,
    "Database identity mismatch.",
  );
  requireCheck(identity.version >= 180000 && identity.version < 190000, "Expected PostgreSQL 18.");
  pass("exact Test 2 database identity and PostgreSQL 18");

  const migrations = readdirSync(resolve(backend, "prisma/migrations"))
    .filter((name) => existsSync(resolve(backend, "prisma/migrations", name, "migration.sql")))
    .sort();
  const checksums = new Map(
    migrations.map((name) => [
      name,
      createHash("sha256")
        .update(readFileSync(resolve(backend, "prisma/migrations", name, "migration.sql")))
        .digest("hex"),
    ]),
  );
  async function migrationState() {
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'`;
    const hasLedger = tables.some((row) => row.table_name === "_prisma_migrations");
    const ledger = hasLedger
      ? await prisma.$queryRaw`
      SELECT migration_name, checksum, finished_at, rolled_back_at
      FROM _prisma_migrations ORDER BY migration_name`
      : [];
    requireCheck(tables.length === 0 || hasLedger, "Nonempty database without migration history.");
    requireCheck(
      ledger.every(
        (row, i) =>
          row.migration_name === migrations[i] &&
          row.checksum === checksums.get(row.migration_name) &&
          row.finished_at &&
          !row.rolled_back_at,
      ),
      "Refusing divergent, failed or altered migration history.",
    );
    return { tables, ledger };
  }
  stage = "migration preflight";
  await migrationState();
  if (args.includes("--migrate")) {
    await prisma.$disconnect();
    const result = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { cwd: backend, env: isolated, encoding: "utf8", timeout: 240_000, maxBuffer: 2_000_000 },
    );
    // CLI diagnostics can include credentials; never forward raw child output.
    const code = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.match(/\bP\d{4}\b/)?.[0];
    requireCheck(
      result.status === 0,
      `Prisma migrate deploy failed (${code ?? "see private diagnostics"}).`,
    );
    pass("repository Prisma migrate deploy");
  }
  stage = "schema verification";
  const state = await migrationState();
  requireCheck(state.ledger.length === migrations.length, "Pending migrations remain.");
  const models = Prisma.dmmf.datamodel.models;
  const names = new Set(state.tables.map((row) => row.table_name));
  requireCheck(
    names.has("_prisma_migrations") &&
      models.every((model) => names.has(model.dbName ?? model.name)),
    "Model/table mismatch.",
  );
  const columns = await prisma.$queryRaw`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`;
  const columnSet = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
  requireCheck(
    models.every((model) =>
      model.fields
        .filter((field) => field.kind !== "object")
        .every((field) =>
          columnSet.has(`${model.dbName ?? model.name}.${field.dbName ?? field.name}`),
        ),
    ),
    "Missing model columns.",
  );
  const [constraints] = await prisma.$queryRaw`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT convalidated)::int AS invalid
    FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace`;
  requireCheck(constraints.total > 0 && constraints.invalid === 0, "Foreign keys not validated.");
  pass(
    `${state.ledger.length} migrations; ${models.length} model tables; ${names.size} total tables; all columns and foreign keys`,
  );

  stage = "local application startup";
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    requireCheck(
      server && url.origin === `http://127.0.0.1:${server.address().port}`,
      "External HTTP integrations are forbidden in this test.",
    );
    return nativeFetch(input, options);
  };
  // Use the actual application factory, without bootstrap schedulers or workers.
  const { createApp } = await import("../src/app.ts");
  const { env } = await import("../src/config/env.ts");
  for (const key of [
    "ACCOUNT_SAFE_LINKING_ENABLED",
    "PHONE_PASSWORD_AUTH_ENABLED",
    "PHONE_SMS_RECOVERY_ENABLED",
    "COACH_SYNC_ENABLED",
    "STAGING_AUTOMATION_ENABLED",
    "NUTRITION_JOBS_ENABLED",
    "SCHEDULER_TRIGGER_ENABLED",
  ]) {
    requireCheck(env[key] === false, "A disabled feature was enabled.");
  }
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  async function api(path, expected, { method = "GET", token, body, cookie } = {}) {
    const response = await globalThis.fetch(`${base}${path}`, {
      method,
      signal: globalThis.AbortSignal.timeout(30_000),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    requireCheck(
      response.status === expected,
      `HTTP status mismatch at ${path}: ${response.status}.`,
    );
    const envelope = await response.json();
    requireCheck(envelope.success === expected < 400, `Invalid envelope at ${path}.`);
    return { data: envelope.data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  stage = "readiness and unauthenticated session rejection";
  requireCheck(
    (await api("/api/health/ready", 200)).data.checks.database === "up",
    "Readiness failed.",
  );
  await api("/api/auth/me", 401);
  pass("actual backend readiness and unauthenticated session rejection");

  stage = "synthetic registration and login";
  const password = `Test2-Aa9-${randomBytes(24).toString("hex")}`;
  const email = `test2-${randomUUID()}@example.invalid`;
  const registered = await api("/api/auth/register", 201, {
    method: "POST",
    body: { email, password, fullName: "Synthetic Test Two" },
  });
  const userId = registered.data.user.id;
  const login = await api("/api/auth/login", 200, { method: "POST", body: { email, password } });
  requireCheck(login.data.user.id === userId && login.cookie, "Login/session mismatch.");
  const token = login.data.tokens.accessToken;
  requireCheck(
    (await api("/api/auth/me", 200, { token })).data.user.id === userId,
    "Session mismatch.",
  );
  pass("synthetic register, password login and authenticated session");

  stage = "basic user preference persistence";
  await api("/api/account/mascot", 200, {
    method: "PATCH",
    token,
    body: { mascotId: "mirmir", animationEnabled: false },
  });
  const refreshed = await api("/api/auth/refresh", 200, { method: "POST", cookie: login.cookie });
  const prefs = (
    await api("/api/account/mascot", 200, { token: refreshed.data.tokens.accessToken })
  ).data.preferences;
  requireCheck(
    prefs.mascotId === "mirmir" && prefs.animationEnabled === false,
    "Preference readback mismatch.",
  );
  // An independent client proves writes reached this database, beyond an HTTP cache.
  const stored = await prisma.user.findUnique({ where: { id: userId } });
  const preference = await prisma.dashboardCardPreference.findUnique({ where: { userId } });
  requireCheck(
    stored?.email === email &&
      stored.hasUsablePassword === true &&
      stored.authVersion === 0 &&
      stored.passwordHash !== password &&
      stored.passwordHash.startsWith("$2") &&
      preference?.mascotId === "mirmir" &&
      preference.mascotAnimation === false,
    "Database readback mismatch.",
  );
  pass("preference write/read after refresh and independent Test 2 database readback");
  await api("/api/auth/logout", 200, { method: "POST", cookie: refreshed.cookie });
  pass("logout; no health data, external service, Admin or background job used");
  console.log(
    JSON.stringify({
      result: "PASS",
      target: TARGET,
      migrations: migrations.length,
      modelTables: models.length,
      checks,
      syntheticRowsRetained: true,
      servingStagingChanged: false,
    }),
  );
} catch (error) {
  // Do not serialize ORM errors, credentials, assertion values or HTTP payloads.
  console.error(
    JSON.stringify({
      result: "BLOCKED",
      stage,
      code: /^P\d{4}$/.test(error?.code ?? "") ? error.code : "TEST2_ACCEPTANCE_FAILED",
      checks,
    }),
  );
  process.exitCode = 1;
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  await prisma?.$disconnect();
}
