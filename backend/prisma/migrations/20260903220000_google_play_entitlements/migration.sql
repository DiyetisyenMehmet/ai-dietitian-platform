-- Google Play entitlements are stored independently from the legacy iyzico
-- checkout records. The raw Google purchaseToken is deliberately NEVER stored;
-- only a SHA-256 hash is persisted for idempotency/account-ownership checks.

-- CreateTable
CREATE TABLE "google_play_entitlements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchaseTokenHash" TEXT NOT NULL,
    "linkedPurchaseTokenHash" TEXT,
    "productId" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "orderId" TEXT,
    "rawState" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_play_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_play_entitlements_purchaseTokenHash_key"
ON "google_play_entitlements"("purchaseTokenHash");

-- CreateIndex
CREATE INDEX "google_play_entitlements_userId_expiresAt_idx"
ON "google_play_entitlements"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "google_play_entitlements_linkedPurchaseTokenHash_idx"
ON "google_play_entitlements"("linkedPurchaseTokenHash");

-- AddForeignKey
ALTER TABLE "google_play_entitlements"
ADD CONSTRAINT "google_play_entitlements_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
