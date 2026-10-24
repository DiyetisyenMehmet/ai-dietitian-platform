// Independent test harness for the compiled, composed backend. No DB or SMTP.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const path = require("node:path");
const test = require("node:test");

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
