"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");

const EXPECTED_VERSION = "3.0.4-diewish.backport.1";
const EXPECTED_SOURCE_COMMIT = "28d440b5dd449dbf1fe6f3506cf94ecca4d02660";

const requested = process.argv.slice(2);
const projects = requested.length ? requested : ["backend", "frontend"];

for (const project of projects) {
  if (!["backend", "frontend"].includes(project)) {
    throw new Error(`unsupported project: ${project}`);
  }

  const packageJson = path.join(process.cwd(), project, "package.json");
  const requireFromProject = createRequire(packageJson);
  const braces = requireFromProject("braces");
  const pkg = requireFromProject("braces/package.json");

  assert.equal(pkg.version, EXPECTED_VERSION);
  assert.equal(pkg.diewishSecurityBackport?.advisory, "GHSA-vfj7-8cjw-p6xm");
  assert.equal(pkg.diewishSecurityBackport?.sourceCommit, EXPECTED_SOURCE_COMMIT);
  assert.equal(pkg.diewishSecurityBackport?.syntheticLocalVersion, true);
  assert.equal(pkg.diewishSecurityBackport?.upstreamPatchedReleaseAvailable, false);
  assert.deepEqual(braces.expand("{a,b}"), ["a", "b"]);

  const hostile = "{".repeat(101) + "a,b" + "}".repeat(101);
  assert.throws(() => braces(hostile), /exceeds max depth/i);

  let ast = { type: "text", value: "a" };
  for (let i = 0; i < 101; i++) ast = { type: "brace", nodes: [ast] };
  ast = { type: "root", nodes: [ast] };
  assert.throws(() => braces.compile(ast), /exceeds max depth/i);

  console.log(`DIEWISH_BRACES_GHSA_DEPTH_GUARD=PASS project=${project}`);
}
