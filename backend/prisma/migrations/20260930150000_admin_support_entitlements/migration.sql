CREATE TABLE "admin_support_entitlements" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "tier" "SubscriptionTier" NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "admin_support_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_support_entitlements_userId_key"
  ON "admin_support_entitlements"("userId");

CREATE INDEX "admin_support_entitlements_expiresAt_idx"
  ON "admin_support_entitlements"("expiresAt");

CREATE INDEX "admin_support_entitlements_revokedAt_idx"
  ON "admin_support_entitlements"("revokedAt");

ALTER TABLE "admin_support_entitlements"
  ADD CONSTRAINT "admin_support_entitlements_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
