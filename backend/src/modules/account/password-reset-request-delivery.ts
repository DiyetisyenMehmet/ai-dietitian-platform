import { setTimeout as delay } from "node:timers/promises";
import type { Request, Response } from "express";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { drainPasswordResetDeliveries } from "./password-reset-delivery";

const unavailable = () =>
  new ApiError(
    503,
    "E-posta ile kurtarma şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
    { code: "EMAIL_DELIVERY_UNAVAILABLE" },
  );

/** No supplied URL or credentials: only the already-bound staging backend and
 * its Google-signed runtime identity. This is not a periodic wake-up. */
export function assertRequestDeliveryConfigured(): void {
  const target = new URL(env.SCHEDULER_OIDC_AUDIENCE || "https://invalid.local");
  if (
    !env.SCHEDULER_TRIGGER_ENABLED ||
    target.protocol !== "https:" ||
    !target.hostname.endsWith(".run.app") ||
    target.pathname !== "/" ||
    target.search ||
    target.hash ||
    target.username ||
    target.password ||
    target.port ||
    !env.SCHEDULER_SERVICE_ACCOUNT_EMAIL.startsWith("diewish-staging-runtime@")
  ) {
    throw unavailable();
  }
}

/** Await worker acceptance BEFORE acknowledging the public request, equally
 * for known, excluded and unknown accounts. SMTP starts AFTER worker headers.
 * Keep the separate HTTP request open until delivery/retries finish so Cloud
 * Run request-based CPU is available after the public response has ended. */
export async function requestPasswordResetDelivery(userId: string | null): Promise<void> {
  assertRequestDeliveryConfigured();
  try {
    const audience = env.SCHEDULER_OIDC_AUDIENCE.replace(/\/$/, "");
    const identity = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity" +
        `?audience=${encodeURIComponent(env.SCHEDULER_OIDC_AUDIENCE)}&format=full`,
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3_000) },
    );
    if (!identity.ok) throw unavailable();
    const token = await identity.text();
    const controller = new AbortController();
    // The header deadline is independent of the bounded worker lifetime.
    const headerDeadline = setTimeout(() => controller.abort(), 8_000);
    let response: globalThis.Response;
    try {
      response = await fetch(`${audience}${env.API_PREFIX}/internal/scheduler/password-reset`, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } finally {
      clearTimeout(headerDeadline);
    }
    if (response.status !== 202) {
      controller.abort();
      throw unavailable();
    }
    const bodyDeadline = setTimeout(() => controller.abort(), 165_000);
    // The receiving Cloud Run request remains active until its response ends.
    void response
      .text()
      .catch(() => {
        logger.warn(
          { code: "PASSWORD_RESET_REQUEST_WORKER_INTERRUPTED" },
          "Recovery worker interrupted",
        );
      })
      .finally(() => clearTimeout(bodyDeadline));
  } catch {
    // Never expose account existence, tokens, target addresses or SMTP errors.
    throw unavailable();
  }
}

/** Authenticated request only. No public status/recipient/token disclosure. */
export async function servePasswordResetDelivery(req: Request, res: Response): Promise<void> {
  const userId = (req.body as { userId: string | null }).userId;
  const connection = new AbortController();
  res.on("close", () => connection.abort());
  res.status(202);
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write('{"accepted":true}\n');
  try {
    if (!userId) return;
    const deadline = Date.now() + 135_000;
    // Existing three-attempt / one-minute backoff policy, only for this request.
    // Successful delivery stops immediately; no idle polling survives the request.
    for (let pass = 0; pass < 3 && Date.now() < deadline; pass++) {
      await drainPasswordResetDeliveries(userId);
      const job = await prisma.passwordResetDelivery.findUnique({ where: { userId } });
      if (!job || job.completedAt || job.attempts >= 3) return;
      const retryAt = Math.max(
        job.attemptedAt ? job.attemptedAt.getTime() + 61_000 : 0,
        job.leaseUntil?.getTime() ?? 0,
      );
      if (retryAt >= deadline) return;
      await delay(Math.max(0, retryAt - Date.now()), undefined, { signal: connection.signal });
    }
  } catch {
    logger.warn(
      { code: "PASSWORD_RESET_REQUEST_WORKER_UNAVAILABLE" },
      "Recovery request worker unavailable",
    );
  } finally {
    res.end();
  }
}
