// Independent compiled-backend tests. Only the fixed disposable CI DB; no SMTP.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const CI_DATABASE = "postgresql://diewish:diewish@127.0.0.1:5432/g1_test2_source?schema=public";
assert.equal(process.env.DATABASE_URL, CI_DATABASE, "Only the disposable CI database is permitted");
assert.equal(process.env.NODE_ENV, "test");
assert.equal(process.env.DIEWISH_ENVIRONMENT, "test");
const backend = process.env.COMPOSED_BACKEND;
assert.ok(
  backend && path.isAbsolute(backend),
  "COMPOSED_BACKEND must identify the verified source",
);
const load = createRequire(path.join(backend, "package.json"));
const tokens = load("./dist/utils/jwt.js");
const jwt = load("jsonwebtoken");
const { env } = load("./dist/config/env.js");
const { clearRefreshCookie } = load("./dist/modules/auth/auth.controller.js");

test("composed JWT access/refresh claims remain separate and owner-bound", () => {
  const user = {
    userId: "synthetic-owner",
    email: "synthetic@example.invalid",
    role: "USER",
    authVersion: 3,
  };
  const access = tokens.signAccessToken(user);
  const claims = tokens.verifyAccessToken(access);
  assert.equal(claims.sub, user.userId);
  assert.equal(claims.authVersion, 3);
  assert.equal(claims.iss, env.JWT_ISSUER);
  assert.ok(claims.exp > claims.iat);
  const refresh = tokens.signRefreshToken({
    userId: user.userId,
    tokenId: "synthetic-session",
  });
  assert.equal(tokens.verifyRefreshToken(refresh).jti, "synthetic-session");
  assert.throws(() => tokens.verifyAccessToken(refresh));
  assert.throws(() => tokens.verifyRefreshToken(access));
});

test("composed JWT rejects wrong signature, issuer, expiry and unsigned input", () => {
  const claims = {
    sub: "synthetic-owner",
    email: "synthetic@example.invalid",
    role: "USER",
    type: "access",
  };
  const good = { issuer: env.JWT_ISSUER, expiresIn: "1m" };
  for (const token of [
    jwt.sign(claims, "different-synthetic-signature-secret", good),
    jwt.sign(claims, env.JWT_ACCESS_SECRET, {
      ...good,
      issuer: "unexpected-issuer",
    }),
    jwt.sign(claims, env.JWT_ACCESS_SECRET, { ...good, expiresIn: -1 }),
    jwt.sign(claims, "", { algorithm: "none", issuer: env.JWT_ISSUER }),
  ])
    assert.throws(() => tokens.verifyAccessToken(token));
});

test("composed cookie clearing keeps HttpOnly/path/SameSite and Secure for SameSite=None", () => {
  const previous = env.REFRESH_COOKIE_SAME_SITE;
  try {
    for (const sameSite of ["lax", "strict", "none"]) {
      env.REFRESH_COOKIE_SAME_SITE = sameSite;
      let captured;
      clearRefreshCookie({
        clearCookie: (name, options) => {
          captured = { name, options };
        },
      });
      assert.equal(captured.name, env.REFRESH_COOKIE_NAME);
      assert.equal(captured.options.httpOnly, true);
      assert.equal(captured.options.path, `${env.API_PREFIX}/auth`);
      assert.equal(captured.options.sameSite, sameSite);
      assert.equal(captured.options.secure, sameSite === "none");
    }
  } finally {
    env.REFRESH_COOKIE_SAME_SITE = previous;
  }
});

test("production cookie configuration is Secure in a synthetic local process", () => {
  const script = `const {clearRefreshCookie}=require('./dist/modules/auth/auth.controller.js');
    clearRefreshCookie({clearCookie:(_name,options)=>process.stdout.write(JSON.stringify(options))});`;
  const result = execFileSync(process.execPath, ["-e", script], {
    cwd: backend,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DIEWISH_ENVIRONMENT: "production",
    },
    encoding: "utf8",
  });
  const options = JSON.parse(result);
  assert.equal(options.secure, true);
  assert.equal(options.httpOnly, true);
});

test("composed blood upload rejects empty/corrupt bytes before storage or DB", async (t) => {
  const storage = load("./dist/lib/storage");
  const { bloodTestService } = load(
    "./dist/modules/blood-test/blood-test.service.js",
  );
  let storageCalls = 0;
  t.mock.method(storage, "getStorageProvider", () => {
    storageCalls++;
    throw new Error("Storage must not be reached");
  });
  for (const buffer of [
    Buffer.alloc(0),
    Buffer.from("synthetic invalid PDF bytes"),
  ]) {
    await assert.rejects(
      bloodTestService.upload(
        "synthetic-owner",
        { buffer, originalName: "synthetic.pdf", size: buffer.length },
        { testDate: "2026-01-01" },
        {},
      ),
      (error) =>
        error.statusCode === 400 &&
        /empty|corrupt|Unsupported/.test(error.message),
    );
  }
  assert.equal(storageCalls, 0);
});

test("CI-only schema: 50 to 52, exact validated CHECK, preserved owners and already-52 no-op", async (t) => {
  const { PrismaClient } = load("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: CI_DATABASE } }, log: [] });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "g1-schema-ci-"));
  const owners = [];
  t.after(async () => {
    try {
      // Only rows created by this test, in the guarded disposable PostgreSQL.
      await prisma.user.deleteMany({ where: { id: { in: owners } } });
    } finally {
      await prisma.$disconnect();
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
  const identity = await prisma.$queryRawUnsafe("SELECT current_database() AS db, current_user AS role");
  assert.deepEqual(identity, [{ db: "g1_test2_source", role: "diewish" }]);
  const tables = await prisma.$queryRawUnsafe("SELECT count(*) AS count FROM information_schema.tables WHERE table_schema='public'");
  assert.equal(Number(tables[0].count), 0, "Fixture requires a fresh CI database");

  const source = path.join(backend, "prisma/migrations");
  const additions = ["20261020110000_dost_mascot_preference", "20261021001000_mascot_collection_preferences"];
  const names = fs.readdirSync(source).filter((name) => fs.existsSync(path.join(source, name, "migration.sql"))).sort();
  assert.equal(names.length, 52);
  assert.deepEqual(names.slice(-2), additions);
  const checksums = new Map(names.map((name) => [name, createHash("sha256").update(fs.readFileSync(path.join(source, name, "migration.sql"))).digest("hex")]));
  const fixture = path.join(temporary, "prisma");
  fs.mkdirSync(path.join(fixture, "migrations"), { recursive: true });
  fs.copyFileSync(path.join(backend, "prisma/schema.prisma"), path.join(fixture, "schema.prisma"));
  fs.copyFileSync(path.join(source, "migration_lock.toml"), path.join(fixture, "migrations/migration_lock.toml"));
  for (const name of names.slice(0, 50)) fs.cpSync(path.join(source, name), path.join(fixture, "migrations", name), { recursive: true });
  let migrationInvocations = 0;
  function migrate() {
    migrationInvocations++;
    try {
      execFileSync(process.execPath, [load.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", path.join(fixture, "schema.prisma")], {
        cwd: backend, env: { ...process.env, DATABASE_URL: CI_DATABASE, DIRECT_DATABASE_URL: CI_DATABASE },
        stdio: "pipe", timeout: 120000,
      });
    } catch {
      throw new Error("Disposable CI migrations failed; CLI output withheld");
    }
  }
  const history = () => prisma.$queryRawUnsafe("SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name");
  function pending(rows) {
    assert.ok(rows.length >= 50 && rows.length <= 52, "Unexpected history size");
    for (const row of rows) {
      assert.ok(row.finished_at && !row.rolled_back_at, "Failed or rolled-back migration");
      assert.equal(row.checksum, checksums.get(row.migration_name), "Migration checksum mismatch");
    }
    assert.deepEqual(rows.map((row) => row.migration_name).sort(), names.slice(0, rows.length), "Unexpected or duplicate migration history");
    const remaining = names.slice(rows.length);
    assert.ok(remaining.every((name) => additions.includes(name)), "Unreviewed migration pending");
    return remaining;
  }
  const ids = ["classic", "diewish-robot", "minis", "bilge", "enerjik", "lina", "bulut", "yesil-damla", "minik-bulut", "mirmir", "dost", "nox", "fit", "guclu", "tombis", "mini-robot"];
  assert.deepEqual(load("./dist/modules/account/account.schemas.js").MASCOT_IDS, ids);
  const expectedDefinition = 'CHECK (("mascotId" = ANY (ARRAY[' + ids.map((id) => "'" + id + "'::text").join(", ") + '])))';
  const constraint = () => prisma.$queryRawUnsafe("SELECT c.convalidated AS validated, c.contype::text AS kind, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE c.conrelid='public.dashboard_card_preferences'::regclass AND c.conname='dashboard_card_preferences_mascot_id_check'");
  function validateConstraint(rows) {
    assert.equal(rows.length, 1, "Expected one CHECK on the exact public table");
    assert.equal(rows[0].kind, "c");
    assert.equal(rows[0].validated, true, "CHECK must be validated");
    assert.equal(rows[0].definition.replace(/\s+/g, ""), expectedDefinition.replace(/\s+/g, ""), "Full CHECK expression must match all 16 identities without extra conditions");
  }
  async function applyReviewedPending() {
    const remaining = pending(await history());
    if (remaining.length) migrate();
    validateConstraint(await constraint());
    return remaining.length;
  }
  migrate();
  const oldHistory = await history();
  assert.deepEqual(pending(oldHistory), additions);
  for (const mascotId of ["classic", "mirmir"]) {
    const user = await prisma.user.create({ data: { email: `g1-ci-${mascotId}@example.invalid`, passwordHash: "synthetic-not-for-login" } });
    owners.push(user.id);
    await prisma.dashboardCardPreference.create({ data: { userId: user.id, mascotId, mascotAnimation: mascotId === "classic", cardOrder: ["coach", "food"] } });
  }
  const preferences = () => prisma.dashboardCardPreference.findMany({ where: { userId: { in: owners } }, orderBy: { userId: "asc" } });
  const before = await preferences();
  for (const name of additions) fs.cpSync(path.join(source, name), path.join(fixture, "migrations", name), { recursive: true });
  assert.equal(await applyReviewedPending(), 2);
  assert.equal((await history()).length, 52);
  assert.deepEqual(await preferences(), before, "Existing classic/mirmir rows, owners and layout must be unchanged");
  const afterHistory = await history();
  const callsBeforeNoOp = migrationInvocations;
  assert.equal(await applyReviewedPending(), 0);
  assert.equal(migrationInvocations, callsBeforeNoOp, "Already-52 must not invoke migration deploy again");
  assert.deepEqual(await history(), afterHistory);
  assert.deepEqual(await preferences(), before);

  // Negative planner/preflight regressions use synthetic copies, never real DB metadata edits.
  for (const changed of [
    { checksum: "0".repeat(64) }, { finished_at: null }, { rolled_back_at: new Date() },
    { migration_name: "unreviewed-migration" },
  ]) assert.throws(() => pending([{ ...afterHistory[0], ...changed }, ...afterHistory.slice(1)]));
  assert.throws(() => pending([...afterHistory.slice(0, 51), afterHistory[0]]));
  const valid = await constraint();
  for (const invalid of [[], [{ ...valid[0], validated: false }], [{ ...valid[0], kind: "f" }],
    [{ ...valid[0], definition: valid[0].definition.replace("'nox'::text", "'unapproved'::text") }],
    [{ ...valid[0], definition: valid[0].definition + " OR TRUE" }]]) assert.throws(() => validateConstraint(invalid));
  assert.equal(migrationInvocations, callsBeforeNoOp, "Rejected preflights must not invoke migration deploy");
  t.diagnostic("PASS: CI-only 50->52; validated exact 16 CHECK; classic/mirmir owners unchanged; already-52 zero additional migration calls; failed/checksum/constraint drift rejected");
});
