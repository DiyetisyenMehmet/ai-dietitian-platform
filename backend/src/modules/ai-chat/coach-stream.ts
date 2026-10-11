import type { Request, Response } from "express";
import { env } from "../../config/env";
import { authRepository } from "../auth/auth.repository";
import { verifyAccessToken } from "../../utils/jwt";
import { asyncHandler } from "../../utils/async-handler";
import { ApiError } from "../../utils/api-error";
import { CoachEventBroker, coachVersion, sameCoachDatabase } from "./coach-events";

let broker: CoachEventBroker | null = null;

export function coachConnectionCount(): number {
  return broker?.activeConnections ?? 0;
}
export const coachStream = asyncHandler(async (req: Request, res: Response) => {
  if (!env.COACH_SYNC_ENABLED) {
    throw new ApiError(409, "Coach live sync is explicitly disabled.", {
      code: "COACH_SYNC_DISABLED",
    });
  }
  const runtime = env.DIEWISH_ENVIRONMENT ?? env.NODE_ENV;
  const url = env.COACH_SYNC_DATABASE_URL;
  // Never reuse the migration credential or silently bypass transaction pooling.
  if (runtime === "production" || !url || !sameCoachDatabase(env.DATABASE_URL, url)) {
    throw new ApiError(503, "Coach live sync is not configured.", {
      code: "COACH_SYNC_UNAVAILABLE",
    });
  }
  broker ??= new CoachEventBroker(url);
  // Preserve headroom in the existing 40-request Cloud Run instance.
  if (broker.activeConnections >= 20)
    throw ApiError.tooManyRequests("Coach connection capacity reached.");
  const userId = req.user!.id; // Existing authenticate middleware runs first.
  if (broker.connectionsFor(userId) >= 6)
    throw ApiError.tooManyRequests("Coach account connection capacity reached.");
  const token = req.headers.authorization!.slice("Bearer ".length).trim();
  const claims = verifyAccessToken(token);
  const lifetime = Math.min(145000, claims.exp! * 1000 - Date.now());
  if (lifetime <= 0) throw ApiError.unauthorized();

  let release: () => void = () => {};
  let ended = false;
  let ready = false;
  const buffered: unknown[] = [];
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (ended) return;
    ended = true;
    clearInterval(heartbeat);
    clearTimeout(expiry);
    release?.();
    if (!res.writableEnded) res.end();
  };
  const write = (event: string, data: unknown) => {
    if (ended || res.destroyed) return;
    // No unbounded buffering for slow clients. Reconnect reads the watermark.
    if (!res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) close();
  };
  res.on("close", close);
  release = await broker.subscribe(userId, {
    changed: ({ type, conversationId, version }) => {
      if (Date.now() >= claims.exp! * 1000) {
        close();
        return;
      }
      const event = { type, conversationId, version };
      if (!ready) {
        if (buffered.length >= 100) {
          close();
          return;
        }
        buffered.push(event);
      } else write("changed", event);
    },
    disconnected: () => {
      if (res.headersSent) close();
    },
  });
  if (ended) {
    release();
    return;
  }
  try {
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    // Subscription precedes snapshot. Earlier notifications may harmlessly repeat.
    write("ready", { version: await coachVersion(userId) });
    ready = true;
    for (const event of buffered) write("changed", event);
    if (ended) return;
    let checking = false;
    heartbeat = setInterval(() => {
      if (ended || checking) return;
      checking = true;
      void (async () => {
        try {
          verifyAccessToken(token);
          const user = await authRepository.findUserById(userId);
          if (ended) return;
          if (!user?.isActive) {
            close();
            return;
          }
          if (!res.write(": keepalive\n\n")) close();
        } catch {
          close();
        } finally {
          checking = false;
        }
      })();
    }, 25000);
    expiry = setTimeout(close, Math.max(0, Math.min(145000, claims.exp! * 1000 - Date.now())));
  } catch {
    close();
  }
});
