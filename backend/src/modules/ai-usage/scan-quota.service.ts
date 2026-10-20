import { Prisma, type PrismaClient, type ScanQuotaOperation } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { normalizeBarcode } from "../nutrition-data/barcode";
import { readEffectiveSubscriptionState } from "../payments/subscription-state";
import {
  SCAN_QUOTA_LEASE_MS,
  scanQuotaDigest,
  scanQuotaEnabled,
  scanQuotaStatus,
  type ScanQuotaConfiguration,
  type ScanQuotaFeature,
} from "./scan-quota-policy";

const uuid = z.string().uuid();
const featureSchema = z.enum(["PHOTO_SCAN", "BARCODE_SCAN"]);
type ReserveInput =
  | { feature: "PHOTO_SCAN"; idempotencyKey: string; input: Uint8Array }
  | { feature: "BARCODE_SCAN"; idempotencyKey: string; barcode: string };
type PersistResult = (
  tx: Prisma.TransactionClient,
  operationId: string,
) => Promise<{ resultRef: string; provider: string; model: string } | null>;

function error(code: string, status = 409): ApiError {
  // Never include input, identifiers, provider errors or secrets in messages.
  return new ApiError(status, "Tarama işlem durumu doğrulanamadı.", { code });
}

function view(operation: ScanQuotaOperation, now: Date) {
  return {
    operationId: operation.id,
    feature: operation.feature as ScanQuotaFeature,
    status:
      operation.status === "RESERVED" && operation.expiresAt <= now
        ? ("EXPIRED" as const)
        : operation.status,
    resultRef: operation.resultRef,
    expiresAt: operation.expiresAt.toISOString(),
  };
}

/** Internal service only: no product route, provider call, scheduler or timer. */
export function createScanQuotaService(
  db: PrismaClient = prisma,
  configuration: () => ScanQuotaConfiguration = () => env,
) {
  function requireEnabled() {
    const config = configuration();
    if (!scanQuotaEnabled(config)) throw error("SCAN_QUOTA_FOUNDATION_DISABLED", 404);
    if (config.SCAN_QUOTA_HASH_SECRET.length < 32) throw error("SCAN_QUOTA_HASH_UNCONFIGURED", 503);
    return config;
  }

  async function databaseNow(tx: Prisma.TransactionClient) {
    // NOW() is frozen at transaction start; a lock waiter needs the actual time.
    const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    return rows[0].now;
  }

  async function locked<T>(
    userId: string,
    feature: ScanQuotaFeature,
    run: (tx: Prisma.TransactionClient, now: Date) => Promise<T>,
  ) {
    uuid.parse(userId);
    featureSchema.parse(feature);
    return db.$transaction(
      async (tx) => {
        const key = `scan-quota:${userId}:${feature}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        // Paid grants update this row in their own transaction. Use the canonical
        // read resolver on this same transaction, never the cached tier alone.
        const users = await tx.$queryRaw<Array<{ isActive: boolean }>>`
        SELECT "isActive" FROM "users" WHERE "id" = ${userId} FOR UPDATE
      `;
        if (!users[0]?.isActive) throw error("SCAN_QUOTA_ACCOUNT_UNAVAILABLE", 401);
        return run(tx, await databaseNow(tx));
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10_000,
        maxWait: 5_000,
      },
    );
  }

  async function status(
    tx: Prisma.TransactionClient,
    userId: string,
    feature: ScanQuotaFeature,
    now: Date,
  ) {
    const state = await readEffectiveSubscriptionState(userId, tx);
    if (!state) throw error("SCAN_QUOTA_ACCOUNT_UNAVAILABLE", 401);
    if (state.tier !== "FREE") return scanQuotaStatus(feature, state.tier, now);
    const [used, inFlight] = await Promise.all([
      tx.aiUsageEvent.count({ where: { userId, feature } }),
      tx.scanQuotaOperation.count({
        where: { userId, feature, status: "RESERVED", expiresAt: { gt: now } },
      }),
    ]);
    return scanQuotaStatus(feature, state.tier, now, { used, inFlight });
  }

  async function expire(
    tx: Prisma.TransactionClient,
    userId: string,
    feature: ScanQuotaFeature,
    now: Date,
  ) {
    await tx.scanQuotaOperation.updateMany({
      where: { userId, feature, status: "RESERVED", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
  }

  async function withOperation<T>(
    userId: string,
    operationId: string,
    run: (tx: Prisma.TransactionClient, operation: ScanQuotaOperation, now: Date) => Promise<T>,
  ) {
    requireEnabled();
    uuid.parse(operationId);
    uuid.parse(userId);
    const own = await db.scanQuotaOperation.findFirst({ where: { id: operationId, userId } });
    if (!own) throw error("SCAN_QUOTA_OPERATION_NOT_FOUND", 404);
    return locked(userId, featureSchema.parse(own.feature), async (tx, now) => {
      const operation = await tx.scanQuotaOperation.findFirst({
        where: { id: operationId, userId },
      });
      if (!operation) throw error("SCAN_QUOTA_OPERATION_NOT_FOUND", 404);
      return run(tx, operation, now);
    });
  }

  return {
    async getStatus(userId: string, feature: ScanQuotaFeature) {
      if (!scanQuotaEnabled(configuration())) return scanQuotaStatus(feature, null, new Date()); // Zero SQL while OFF.
      requireEnabled();
      return locked(userId, feature, (tx, now) => status(tx, userId, feature, now));
    },

    async reserve(userId: string, input: ReserveInput) {
      const config = requireEnabled();
      uuid.parse(input.idempotencyKey);
      featureSchema.parse(input.feature);
      let payload: Uint8Array | string;
      if (input.feature === "BARCODE_SCAN") {
        const barcode = normalizeBarcode(input.barcode);
        if (!barcode) throw error("INVALID_BARCODE", 400);
        payload = barcode;
      } else {
        if (
          !(input.input instanceof Uint8Array) ||
          !input.input.byteLength ||
          input.input.byteLength > 20 * 1024 * 1024
        )
          throw error("SCAN_QUOTA_INPUT_INVALID", 400);
        payload = input.input;
      }
      const inputHash = scanQuotaDigest(config.SCAN_QUOTA_HASH_SECRET, input.feature, payload);
      const subjectHash = input.feature === "BARCODE_SCAN" ? inputHash : null;
      return locked(userId, input.feature, async (tx, now) => {
        await expire(tx, userId, input.feature, now);
        const quota = await status(tx, userId, input.feature, now);
        if (quota.tier !== "FREE") throw error("SCAN_QUOTA_PAID_POLICY_UNDEFINED", 403);
        const request = await tx.scanQuotaRequest.findUnique({
          where: {
            userId_feature_idempotencyKey: {
              userId,
              feature: input.feature,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { operation: true },
        });
        if (request && request.inputHash !== inputHash) throw error("SCAN_QUOTA_REQUEST_MISMATCH");
        let operation = request?.operation;
        if (operation && operation.status !== "RESERVED" && operation.status !== "SUCCEEDED")
          throw error("SCAN_QUOTA_OPERATION_CLOSED");
        if (!operation && subjectHash) {
          operation =
            (await tx.scanQuotaOperation.findFirst({
              where: {
                userId,
                feature: input.feature,
                subjectHash,
                status: { in: ["RESERVED", "SUCCEEDED"] },
              },
            })) ?? undefined;
        }
        const created = !operation;
        if (!operation) {
          if (!quota.allowed) throw error(quota.reason!, quota.remaining === 0 ? 403 : 409);
          operation = await tx.scanQuotaOperation.create({
            data: {
              userId,
              feature: input.feature,
              inputHash,
              subjectHash,
              expiresAt: new Date(now.getTime() + SCAN_QUOTA_LEASE_MS),
            },
          });
        }
        if (!request)
          await tx.scanQuotaRequest.create({
            data: {
              userId,
              feature: input.feature,
              idempotencyKey: input.idempotencyKey,
              inputHash,
              operationId: operation.id,
            },
          });
        return {
          ...view(operation, now),
          disposition: created
            ? ("RESERVED" as const)
            : operation.status === "SUCCEEDED"
              ? ("REPLAY" as const)
              : ("IN_PROGRESS" as const),
          // Only the worker creating a reservation receives its completion token.
          attemptToken: created ? operation.attemptToken : null,
          quota: await status(tx, userId, input.feature, now),
        };
      });
    },

    async getOperation(userId: string, operationId: string) {
      return withOperation(userId, operationId, async (tx, operation, now) => ({
        ...view(operation, now),
        quota: await status(tx, userId, featureSchema.parse(operation.feature), now),
      }));
    },

    /** Callback must only persist a validated result via tx; never call a provider. */
    async complete(
      userId: string,
      operationId: string,
      attemptToken: string,
      persistResult: PersistResult,
    ) {
      uuid.parse(attemptToken);
      return withOperation(userId, operationId, async (tx, operation, now) => {
        if (operation.attemptToken !== attemptToken) throw error("SCAN_QUOTA_ATTEMPT_MISMATCH");
        const feature = featureSchema.parse(operation.feature);
        if (operation.status === "SUCCEEDED")
          return {
            ...view(operation, now),
            quota: await status(tx, userId, feature, now),
          }; // Lost response: never persist or decrement again.
        if (operation.status !== "RESERVED" || operation.expiresAt <= now)
          throw error("SCAN_QUOTA_OPERATION_CLOSED");
        if ((await status(tx, userId, feature, now)).tier !== "FREE")
          throw error("SCAN_QUOTA_PAID_POLICY_UNDEFINED", 403);
        const result = await persistResult(tx, operation.id);
        const prefix = feature === "PHOTO_SCAN" ? "photo" : "barcode";
        if (
          !result ||
          !new RegExp(`^${prefix}:[A-Za-z0-9_-]{1,100}$`).test(result.resultRef) ||
          !result.provider?.trim() ||
          result.provider.length > 64 ||
          !result.model?.trim() ||
          result.model.length > 128
        )
          throw error("SCAN_QUOTA_RESULT_INVALID", 422);
        const completedAt = await databaseNow(tx);
        if (operation.expiresAt <= completedAt) throw error("SCAN_QUOTA_OPERATION_CLOSED");
        await tx.aiUsageEvent.create({
          data: {
            userId,
            feature,
            provider: result.provider,
            model: result.model,
            scanOperationId: operation.id,
          },
        });
        const completed = await tx.scanQuotaOperation.update({
          where: { id: operation.id },
          data: { status: "SUCCEEDED", resultRef: result.resultRef },
        });
        return {
          ...view(completed, completedAt),
          quota: await status(tx, userId, feature, completedAt),
        };
      });
    },

    async release(
      userId: string,
      operationId: string,
      attemptToken: string,
      outcome: "FAILED" | "CANCELED",
    ) {
      uuid.parse(attemptToken);
      z.enum(["FAILED", "CANCELED"]).parse(outcome);
      return withOperation(userId, operationId, async (tx, operation, now) => {
        if (operation.attemptToken !== attemptToken) throw error("SCAN_QUOTA_ATTEMPT_MISMATCH");
        // A late cancellation cannot refund an already-committed result.
        if (operation.status === "RESERVED")
          operation = await tx.scanQuotaOperation.update({
            where: { id: operation.id },
            data: { status: operation.expiresAt <= now ? "EXPIRED" : outcome },
          });
        return {
          ...view(operation, now),
          quota: await status(tx, userId, featureSchema.parse(operation.feature), now),
        };
      });
    },
  };
}

export const scanQuotaService = createScanQuotaService();
