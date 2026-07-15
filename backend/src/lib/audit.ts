import type { AuditAction, Prisma } from "@prisma/client";

import { logger } from "./logger";
import { prisma } from "./prisma";

/** Best-effort request context captured alongside an audited action. */
export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface RecordAuditInput {
  action: AuditAction;
  /** May be null for actions where the user could not be resolved. */
  userId?: string | null;
  context?: AuditContext;
  /** Small, non-sensitive contextual details. Never include secrets/tokens. */
  metadata?: Prisma.InputJsonValue;
}

/**
 * Persists a security-relevant account action to the append-only audit log.
 *
 * Auditing must never break the primary operation: a logging failure is caught
 * and reported via the application logger instead of propagating. The write is
 * awaited so callers within a request can rely on ordering, but its failure is
 * non-fatal by design.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
        metadata: input.metadata,
      },
    });
    logger.info({ action: input.action, userId: input.userId ?? null }, "Audit event recorded");
  } catch (error) {
    logger.error(
      { err: error, action: input.action, userId: input.userId ?? null },
      "Failed to record audit event",
    );
  }
}
