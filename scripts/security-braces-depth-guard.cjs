"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

for (const project of ["backend", "frontend"]) {
  const base = path.join(process.cwd(), project, "vendor", "braces");
  const braces = require(base);
  const pkg = require(path.join(base, "package.json"));

  assert.equal(pkg.version, "3.0.4-diewish.1");
  assert.deepEqual(braces.expand("{a,b}"), ["a", "b"]);

  const hostile = "{".repeat(101) + "a,b" + "}".repeat(101);
  assert.throws(() => braces(hostile), /exceeds max depth/i);

  let ast = { type: "text", value: "a" };
  for (let i = 0; i < 101; i++) ast = { type: "brace", nodes: [ast] };
  ast = { type: "root", nodes: [ast] };
  assert.throws(() => braces.compile(ast), /exceeds max depth/i);
}

console.log("DIEWISH_BRACES_GHSA_DEPTH_GUARD=PASS");
