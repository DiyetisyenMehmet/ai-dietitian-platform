import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { fork } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import express from "express";

// Keep a vulnerable parser's uncaught decoder error inside a disposable child.
// All requests use synthetic data and an ephemeral loopback listener; no DB.
if (process.env.BODY_PARSER_SECURITY_CHILD === "1") {
  const app = express();
  app.use(
    express.json({
      limit: "1mb",
      verify(req, _res, buf) {
        req.rawBody = buf.toString();
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.post("/echo", (req, res) => res.json({ body: req.body, rawBody: req.rawBody }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ type: err.type }));
  const server = app.listen(0, "127.0.0.1", () => process.send(server.address().port));
  process.on("disconnect", () => {
    server.closeAllConnections();
    server.close();
  });
} else {
  test(
    "compressed parser contracts and delayed trailing bytes preserve process availability",
    { timeout: 15000 },
    async (t) => {
      const child = fork(fileURLToPath(import.meta.url), [], {
        env: { PATH: process.env.PATH, BODY_PARSER_SECURITY_CHILD: "1" },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill();
          await exited;
        }
      });
      const port = await Promise.race([
        once(child, "message").then(([message]) => message),
        once(child, "exit").then(() => {
          throw new Error(`Parser child exited: ${stderr}`);
        }),
      ]);
      const agent = new http.Agent({ keepAlive: true });
      t.after(() => agent.destroy());
      const request = (type, encoding, payload, tail) =>
        new Promise((resolve, reject) => {
          const req = http.request(
            {
              host: "127.0.0.1",
              port,
              path: "/echo",
              method: "POST",
              agent,
              headers: {
                "Content-Type": type,
                "Content-Encoding": encoding,
                "Content-Length": payload.length + (tail?.length || 0),
              },
            },
            (res) => {
              // Decoder EOF precedes HTTP EOF after gzip padding. Send the remaining bytes
              // only after acceptance. This checks compatibility/availability; OSV is
              // the patched-version gate, not this synthetic payload alone.
              if (tail) req.end(tail);
              let body = "";
              res.on("data", (chunk) => {
                body += chunk;
              });
              res.on("error", reject);
              res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
            },
          );
          req.on("error", reject);
          req.setTimeout(5000, () => req.destroy(new Error("Loopback parser request timed out")));
          if (tail) req.write(payload);
          else req.end(payload);
        });
      const json = JSON.stringify({ label: "Sentetik öğün", values: [1, 2] });
      const valid = await request("application/json", "gzip", gzipSync(json));
      assert.equal(valid.status, 200);
      assert.deepEqual(valid.data.body, JSON.parse(json));
      assert.equal(valid.data.rawBody, json, "signature verification bytes remain unchanged");
      const form = await request(
        "application/x-www-form-urlencoded",
        "gzip",
        gzipSync("meal[name]=test"),
      );
      assert.equal(form.status, 200);
      assert.deepEqual(form.data.body, { meal: { name: "test" } });
      const oversized = await request(
        "application/json",
        "gzip",
        gzipSync(JSON.stringify({ value: "x".repeat(1024 * 1024) })),
      );
      assert.equal(oversized.status, 413);
      assert.equal(oversized.data.type, "entity.too.large");
      for (const [type, body] of [
        ["application/json", json],
        ["application/x-www-form-urlencoded", "meal[name]=test"],
      ]) {
        const response = await request(
          type,
          "gzip",
          Buffer.concat([gzipSync(body), Buffer.from([0])]),
          Buffer.alloc(1024, 0x41),
        );
        assert.equal(response.status, 200);
        await delay(50);
        const health = await globalThis.fetch(`http://127.0.0.1:${port}/health`);
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { ok: true });
        assert.equal(child.exitCode, null, stderr);
      }
    },
  );
}
