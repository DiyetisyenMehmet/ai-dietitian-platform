import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:tls";
import type { AddressInfo } from "node:net";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "../config/env";
import { mailer } from "./mailer";

test("real SMTP transport negotiates TLS, sends fragment link, rejects delivery failures without secrets", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "diewish-smtp-test-"));
  const originalEnv = { ...env };
  const certPath = join(dir, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ],
    { stdio: "ignore" },
  );
  const cert = readFileSync(certPath);
  const messages: string[] = [];
  let rejectRecipient = false;
  const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (socket) => {
    socket.setEncoding("utf8");
    socket.write("220 localhost synthetic SMTP\r\n");
    let buffer = "";
    let data = false;
    let message = "";
    socket.on("error", () => undefined);
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            data = false;
            messages.push(message);
            message = "";
            socket.write("250 queued\r\n");
          } else message += line + "\r\n";
        } else if (/^EHLO/.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH/.test(line)) socket.write("235 authenticated\r\n");
        else if (/^MAIL FROM/.test(line)) socket.write("250 sender ok\r\n");
        else if (/^RCPT TO/.test(line))
          socket.write(rejectRecipient ? "550 rejected\r\n" : "250 recipient ok\r\n");
        else if (line === "DATA") {
          data = true;
          socket.write("354 send data\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  t.after(async () => {
    Object.assign(env, originalEnv);
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  });
  Object.assign(env, {
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: (server.address() as AddressInfo).port,
    SMTP_SECURE: true,
    SMTP_USER: "synthetic",
    SMTP_PASSWORD: "test-only",
    SMTP_FROM: "diewish@example.com",
    APP_WEB_URL: "https://app.example.com",
  });
  const original = nodemailer.createTransport;
  const mock = t.mock.method(nodemailer, "createTransport", (options: SMTPTransport.Options) =>
    original({ ...options, tls: { ...options.tls, ca: cert } }),
  );
  await mailer.sendPasswordReset("synthetic@example.com", "synthetic-token");
  assert.equal(messages.length, 1);
  const body = messages[0]!.replace(/=\r\n/g, "").replace(/=3D/g, "=");
  assert.match(body, /https:\/\/app.example.com\/reset-password#token=synthetic-token/);
  assert.doesNotMatch(body, /\?token=/);
  const opts = mock.mock.calls[0]!.arguments[0] as SMTPTransport.Options;
  assert.equal(opts.requireTLS, true);
  assert.equal(opts.logger, false);
  assert.equal(opts.debug, false);
  assert.equal(opts.tls?.rejectUnauthorized, true);
  await mailer.sendEmailVerification("synthetic@example.com", "verification-token");
  assert.equal(messages.length, 2);
  const verification = messages[1]!.replace(/=\r\n/g, "").replace(/=3D/g, "=");
  assert.match(verification, /https:\/\/app.example.com\/verify-email\?token=verification-token/);
  assert.doesNotMatch(verification, /reset-password/);
  rejectRecipient = true;
  await assert.rejects(
    mailer.sendPasswordReset("synthetic@example.com", "must-not-leak"),
    (e: unknown) => {
      assert.ok(e instanceof Error);
      assert.doesNotMatch(e.message, /synthetic@example|must-not-leak|test-only/);
      return true;
    },
  );
  // Without the test-only trusted CA, the normal transport must reject an untrusted certificate.
  mock.mock.restore();
  await assert.rejects(mailer.sendPasswordReset("synthetic@example.com", "untrusted-cert"));
});

test("security address parsing preserves intended recipients without contacting SMTP", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  try {
    for (const [to, expected] of [
      [
        "Synthetic (x(y) <unexpected@example.invalid>) <intended@example.invalid>",
        "intended@example.invalid",
      ],
      [
        "G: (a; <unexpected@example.invalid>) <intended@example.invalid>;",
        "intended@example.invalid",
      ],
      ['<"a@unexpected.invalid>"@expected.invalid>', "@expected.invalid"],
    ]) {
      const result = await transport.sendMail({
        from: "sender@example.invalid",
        to,
        subject: "Synthetic security contract",
        text: "No real mail",
      });
      if (expected.startsWith("@")) {
        // SMTP normalizes unsafe characters in quoted local parts; the
        // security boundary is delivery to the domain outside the quotes.
        assert.equal(result.envelope.to.length, 1);
        assert.ok(result.envelope.to[0]!.endsWith(expected));
      } else {
        assert.deepEqual(result.envelope.to, [expected]);
      }
    }
  } finally {
    transport.close();
  }
});
