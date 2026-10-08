"use strict";
// Only approved non-production validation commands; raw outputs stay private.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const c = require("./platform/contract.cjs");
const platform = process.argv[2];
const actions = {
  frontend: [
    ["type-check", "npx", ["tsc", "--noEmit"]],
    [
      "unit-tests",
      "node",
      [
        "--test",
        ...fs
          .readdirSync(path.join(c.ROOT, "frontend/tests"))
          .filter((p) => p.endsWith(".test.cjs"))
          .map((p) => "tests/" + p),
      ],
    ],
    ["lint", "npm", ["run", "lint"]],
    ["build", "npm", ["run", "build"]],
  ],
  backend: [
    ["type-check", "npm", ["run", "type-check"]],
    ["unit-tests", "npm", ["test"]],
    ["integration-tests", "npm", ["run", "test:integration"]],
    ["lint", "npm", ["run", "lint"]],
    ["build", "npm", ["run", "build"]],
  ],
};
if (!actions[platform]) throw new Error("INVALID_REGRESSION_PLATFORM");
const dir = path.join(c.ROOT, ".qa-private", "regression");
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
for (const [name, command, args] of actions[platform]) {
  const fd = fs.openSync(
    path.join(dir, platform + "-" + name + ".log"),
    "w",
    0o600,
  );
  const result = spawnSync(command, args, {
    cwd: path.join(c.ROOT, platform),
    env: process.env,
    stdio: ["ignore", fd, fd],
    timeout: 600000,
  });
  fs.closeSync(fd);
  const pass = result.status === 0;
  console.log(platform + "/" + name + ": " + (pass ? "PASS" : "FAIL"));
  const raw = fs.readFileSync(
    path.join(dir, platform + "-" + name + ".log"),
    "utf8",
  );
  for (const line of raw.split("\n"))
    if (
      /^[ℹ#]\s*(tests|pass|fail|cancelled|skipped|todo|duration_ms)\s+\d/.test(
        line,
      )
    )
      console.log(line);
  if (!pass) process.exitCode = 1;
}
