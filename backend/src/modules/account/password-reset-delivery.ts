import crypto from "node:crypto";
import { env, isTest } from "../../config/env";
import { recordAudit } from "../../lib/audit";
import { logger } from "../../lib/logger";
import { assertEmailDeliveryConfigured, mailer } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { generateOpaqueToken, hashToken } from "../../utils/jwt";

let running = false;
let timer: NodeJS.Timeout | undefined;

/** Durable metadata queue: no raw link, recipient, or password is stored here.
 * Requests acknowledge acceptance before SMTP, so recipient failures/timing cannot enumerate users.
 * A DB lease makes multiple backend instances safe; failed delivery has bounded retries.
 */
export async function drainPasswordResetDeliveries(): Promise<void> {
  if (running) return;
  running = true;
  try {
    assertEmailDeliveryConfigured();
    const now = new Date();
    const pending = await prisma.passwordResetDelivery.findMany({
      where: {
        completedAt: null,
        attempts: { lt: 3 },
        requestedAt: { gt: new Date(now.getTime() - 60 * 60_000) },
        AND: [
          { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
          {
            OR: [{ attemptedAt: null }, { attemptedAt: { lt: new Date(now.getTime() - 60_000) } }],
          },
        ],
      },
      orderBy: { requestedAt: "asc" },
      take: 2,
    });
    for (const job of pending) {
      const leaseId = crypto.randomUUID();
      const claimed = await prisma.passwordResetDelivery.updateMany({
        where: {
          userId: job.userId,
          requestedAt: job.requestedAt,
          completedAt: null,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: {
          leaseId,
          leaseUntil: new Date(Date.now() + 120_000),
          attemptedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      if (claimed.count !== 1) continue;
      let tokenId: string | undefined;
      try {
        const raw = generateOpaqueToken();
        const recipient = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${job.userId} FOR UPDATE`;
          const current = await tx.passwordResetDelivery.findUnique({
            where: { userId: job.userId },
          });
          const user = await tx.user.findUnique({ where: { id: job.userId } });
          if (
            current?.leaseId !== leaseId ||
            current.completedAt ||
            !user?.isActive ||
            user.role !== "USER" ||
            user.deletionRequestedAt ||
            user.email.endsWith(".diewish.invalid")
          )
            return null;
          await tx.accountToken.updateMany({
            where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null },
            data: { usedAt: new Date() },
          });
          tokenId = crypto.randomUUID();
          await tx.accountToken.create({
            data: {
              id: tokenId,
              userId: user.id,
              type: "PASSWORD_RESET",
              tokenHash: hashToken(raw),
              expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000),
            },
          });
          return user.email;
        });
        if (recipient) {
          await mailer.sendPasswordReset(recipient, raw);
          await recordAudit({ action: "PASSWORD_RESET_REQUESTED", userId: job.userId });
        }
        await prisma.passwordResetDelivery.updateMany({
          where: { userId: job.userId, leaseId },
          data: { completedAt: new Date(), leaseId: null, leaseUntil: null },
        });
      } catch {
        // No SMTP exception payloads: they can contain recipient, credentials or live message content.
        if (tokenId)
          await prisma.accountToken.updateMany({
            where: { id: tokenId },
            data: { usedAt: new Date() },
          });
        await prisma.passwordResetDelivery.updateMany({
          where: { userId: job.userId, leaseId },
          data: { leaseId: null, leaseUntil: null },
        });
        logger.error(
          { code: "PASSWORD_RESET_DELIVERY_FAILED" },
          "Password recovery email delivery failed; bounded retry pending",
        );
      }
    }
  } catch {
    logger.warn(
      { code: "PASSWORD_RESET_DISPATCH_UNAVAILABLE" },
      "Password recovery dispatch unavailable",
    );
  } finally {
    running = false;
  }
}

export function startPasswordResetDelivery(): void {
  if (isTest || timer || !env.SMTP_HOST) return;
  void drainPasswordResetDeliveries();
  timer = setInterval(() => {
    void drainPasswordResetDeliveries();
  }, 30_000);
  timer.unref();
}
export function stopPasswordResetDelivery(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
