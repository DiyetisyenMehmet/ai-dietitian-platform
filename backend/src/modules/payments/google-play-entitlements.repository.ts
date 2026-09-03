import crypto from "node:crypto";

import { Prisma, type SubscriptionTier } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";

/**
 * SQL-backed Google Play ledger.
 *
 * This table intentionally lives outside the legacy iyzico-oriented Prisma
 * payment models. The raw Play purchaseToken is never persisted; SHA-256 hashes
 * provide globally unique idempotency/account binding without retaining a
 * reusable store credential.
 */
export interface GooglePlayEntitlementRow {
  id: string;
  userId: string;
  purchaseTokenHash: string;
  linkedPurchaseTokenHash: string | null;
  productId: string;
  tier: SubscriptionTier;
  orderId: string | null;
  rawState: string;
  startedAt: Date | null;
  expiresAt: Date;
  acknowledgedAt: Date | null;
  lastVerifiedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GrantGooglePlayEntitlementInput {
  userId: string;
  purchaseTokenHash: string;
  linkedPurchaseTokenHash: string | null;
  productId: string;
  tier: SubscriptionTier;
  orderId: string | null;
  rawState: string;
  startedAt: Date | null;
  expiresAt: Date;
}

const SELECT_COLUMNS = Prisma.sql`
  "id", "userId", "purchaseTokenHash", "linkedPurchaseTokenHash", "productId",
  "tier", "orderId", "rawState", "startedAt", "expiresAt", "acknowledgedAt",
  "lastVerifiedAt", "revokedAt", "createdAt", "updatedAt"
`;

function entitlementId(): string {
  return crypto.randomUUID();
}

async function findByHashInTransaction(
  tx: Prisma.TransactionClient,
  purchaseTokenHash: string,
): Promise<GooglePlayEntitlementRow | null> {
  const rows = await tx.$queryRaw<GooglePlayEntitlementRow[]>(Prisma.sql`
    SELECT ${SELECT_COLUMNS}
    FROM "google_play_entitlements"
    WHERE "purchaseTokenHash" = ${purchaseTokenHash}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findBestActiveInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<GooglePlayEntitlementRow | null> {
  const rows = await tx.$queryRaw<GooglePlayEntitlementRow[]>(Prisma.sql`
    SELECT ${SELECT_COLUMNS}
    FROM "google_play_entitlements"
    WHERE "userId" = ${userId}
      AND "revokedAt" IS NULL
      AND "expiresAt" > NOW()
    ORDER BY
      CASE "tier"
        WHEN 'PREMIUM_PLUS'::"SubscriptionTier" THEN 2
        WHEN 'PREMIUM'::"SubscriptionTier" THEN 1
        ELSE 0
      END DESC,
      "expiresAt" DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export const googlePlayEntitlementsRepository = {
  hashPurchaseToken(purchaseToken: string): string {
    return crypto.createHash("sha256").update(purchaseToken).digest("hex");
  },

  async findByTokenHash(purchaseTokenHash: string): Promise<GooglePlayEntitlementRow | null> {
    const rows = await prisma.$queryRaw<GooglePlayEntitlementRow[]>(Prisma.sql`
      SELECT ${SELECT_COLUMNS}
      FROM "google_play_entitlements"
      WHERE "purchaseTokenHash" = ${purchaseTokenHash}
      LIMIT 1
    `);
    return rows[0] ?? null;
  },

  async findBestActiveForUser(userId: string): Promise<GooglePlayEntitlementRow | null> {
    const rows = await prisma.$queryRaw<GooglePlayEntitlementRow[]>(Prisma.sql`
      SELECT ${SELECT_COLUMNS}
      FROM "google_play_entitlements"
      WHERE "userId" = ${userId}
        AND "revokedAt" IS NULL
        AND "expiresAt" > NOW()
      ORDER BY
        CASE "tier"
          WHEN 'PREMIUM_PLUS'::"SubscriptionTier" THEN 2
          WHEN 'PREMIUM'::"SubscriptionTier" THEN 1
          ELSE 0
        END DESC,
        "expiresAt" DESC
      LIMIT 1
    `);
    return rows[0] ?? null;
  },

  /**
   * Idempotently grants/refreshes a verified Play entitlement in one database
   * transaction and synchronizes users.subscriptionTier to the highest active
   * Google Play tier. A purchase token can never be reassigned to another user.
   */
  async grantVerified(input: GrantGooglePlayEntitlementInput): Promise<GooglePlayEntitlementRow> {
    return prisma.$transaction(async (tx) => {
      const existing = await findByHashInTransaction(tx, input.purchaseTokenHash);
      if (existing && existing.userId !== input.userId) {
        throw new ApiError(409, "Google Play purchase belongs to a different Diewish account.", {
          code: "GOOGLE_PLAY_TOKEN_ALREADY_CLAIMED",
        });
      }

      if (input.linkedPurchaseTokenHash) {
        const linked = await findByHashInTransaction(tx, input.linkedPurchaseTokenHash);
        if (linked && linked.userId !== input.userId) {
          throw new ApiError(409, "Linked Google Play purchase belongs to a different Diewish account.", {
            code: "GOOGLE_PLAY_LINKED_TOKEN_ACCOUNT_MISMATCH",
          });
        }

        if (linked && linked.purchaseTokenHash !== input.purchaseTokenHash) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "google_play_entitlements"
            SET "revokedAt" = COALESCE("revokedAt", NOW()),
                "updatedAt" = NOW()
            WHERE "purchaseTokenHash" = ${input.linkedPurchaseTokenHash}
              AND "userId" = ${input.userId}
          `);
        }
      }

      const rows = await tx.$queryRaw<GooglePlayEntitlementRow[]>(Prisma.sql`
        INSERT INTO "google_play_entitlements" (
          "id", "userId", "purchaseTokenHash", "linkedPurchaseTokenHash",
          "productId", "tier", "orderId", "rawState", "startedAt",
          "expiresAt", "lastVerifiedAt", "createdAt", "updatedAt", "revokedAt"
        ) VALUES (
          ${existing?.id ?? entitlementId()}, ${input.userId}, ${input.purchaseTokenHash},
          ${input.linkedPurchaseTokenHash}, ${input.productId}, ${input.tier}::"SubscriptionTier",
          ${input.orderId}, ${input.rawState}, ${input.startedAt}, ${input.expiresAt},
          NOW(), COALESCE(${existing?.createdAt ?? null}::timestamp, NOW()), NOW(), NULL
        )
        ON CONFLICT ("purchaseTokenHash") DO UPDATE SET
          "linkedPurchaseTokenHash" = EXCLUDED."linkedPurchaseTokenHash",
          "productId" = EXCLUDED."productId",
          "tier" = EXCLUDED."tier",
          "orderId" = EXCLUDED."orderId",
          "rawState" = EXCLUDED."rawState",
          "startedAt" = EXCLUDED."startedAt",
          "expiresAt" = EXCLUDED."expiresAt",
          "lastVerifiedAt" = NOW(),
          "updatedAt" = NOW(),
          "revokedAt" = NULL
        WHERE "google_play_entitlements"."userId" = EXCLUDED."userId"
        RETURNING ${SELECT_COLUMNS}
      `);

      const granted = rows[0];
      if (!granted) {
        throw new ApiError(409, "Google Play purchase could not be assigned to this Diewish account.", {
          code: "GOOGLE_PLAY_TOKEN_ALREADY_CLAIMED",
        });
      }

      const best = await findBestActiveInTransaction(tx, input.userId);
      if (!best) {
        throw new ApiError(500, "Google Play entitlement could not be resolved after verification.");
      }

      await tx.user.update({
        where: { id: input.userId },
        data: { subscriptionTier: best.tier },
      });

      return granted;
    });
  },

  async markAcknowledged(userId: string, purchaseTokenHash: string): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "google_play_entitlements"
      SET "acknowledgedAt" = COALESCE("acknowledgedAt", NOW()),
          "updatedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "purchaseTokenHash" = ${purchaseTokenHash}
    `);
  },
};
