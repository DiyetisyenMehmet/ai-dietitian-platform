import type { AdminAuditRiskLevel, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import type { DiewishRuntimeEnvironment } from "./admin.environment";

const FORBIDDEN_AUDIT_KEY =
  /(password|passwordhash|token|secret|credential|authorization|cookie|firebase|blood|health|meal|sleep|weight)/i;

export type AdminAuditSnapshot = Record<string, Prisma.InputJsonValue | null>;

export interface AdminAuditContext {
  actorAdminId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  environment: DiewishRuntimeEnvironment;
  correlationId: string;
  requestId: string;
  riskLevel: AdminAuditRiskLevel;
}

export interface AuditedMutationResult<T> {
  result: T;
  before?: AdminAuditSnapshot;
  after?: AdminAuditSnapshot;
}

function normalizeAuditValue(value: unknown): Prisma.InputJsonValue | null | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 512);
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => normalizeAuditValue(item))
      .filter(
        (item): item is Prisma.InputJsonValue | null => item !== undefined,
      );
  }
  return undefined;
}

/**
 * Builds audit state only from an explicit field allowlist. Arbitrary request
 * bodies must never be dumped into audit metadata.
 */
export function buildAuditSnapshot(
  source: Record<string, unknown>,
  allowedFields: readonly string[],
): AdminAuditSnapshot {
  const snapshot: AdminAuditSnapshot = {};
  for (const field of allowedFields.slice(0, 32)) {
    if (FORBIDDEN_AUDIT_KEY.test(field)) {
      throw ApiError.badRequest("Sensitive data cannot be written to admin audit.");
    }
    const value = normalizeAuditValue(source[field]);
    if (value !== undefined) snapshot[field] = value;
  }
  return snapshot;
}

function assertSafeSnapshot(snapshot: AdminAuditSnapshot | undefined): void {
  if (!snapshot) return;
  for (const [key, value] of Object.entries(snapshot)) {
    if (FORBIDDEN_AUDIT_KEY.test(key)) {
      throw ApiError.badRequest("Sensitive data cannot be written to admin audit.");
    }
    if (typeof value === "string" && value.length > 512) {
      throw ApiError.badRequest("Admin audit value exceeds the allowed size.");
    }
  }
}

/**
 * Executes a future critical admin mutation and its append-only audit write in
 * one Prisma transaction. Audit failure is fail-closed and rolls back the
 * business mutation.
 */
export async function runAuditedAdminMutation<T>(
  context: AdminAuditContext,
  mutate: (tx: Prisma.TransactionClient) => Promise<AuditedMutationResult<T>>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const mutation = await mutate(tx);
    assertSafeSnapshot(mutation.before);
    assertSafeSnapshot(mutation.after);

    try {
      await tx.adminAuditEvent.create({
        data: {
          actorAdminId: context.actorAdminId,
          action: context.action.slice(0, 128),
          targetType: context.targetType.slice(0, 64),
          targetId: context.targetId.slice(0, 128),
          ...(mutation.before ? { beforeState: mutation.before } : {}),
          ...(mutation.after ? { afterState: mutation.after } : {}),
          reason: context.reason?.slice(0, 500) ?? null,
          environment: context.environment,
          correlationId: context.correlationId,
          requestId: context.requestId,
          riskLevel: context.riskLevel,
        },
      });
    } catch {
      throw new ApiError(500, "Admin audit write failed.", {
        code: "ADMIN_AUDIT_FAILED",
        isOperational: true,
      });
    }

    return mutation.result;
  });
}
