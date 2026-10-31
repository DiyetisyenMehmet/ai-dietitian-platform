-- CreateEnum
CREATE TYPE "ScanQuotaOperationStatus" AS ENUM ('RESERVED', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiUsageFeature" ADD VALUE 'PHOTO_SCAN';
ALTER TYPE "AiUsageFeature" ADD VALUE 'BARCODE_SCAN';

-- AlterTable
ALTER TABLE "ai_usage_events" ADD COLUMN     "scanOperationId" TEXT;

-- CreateTable
CREATE TABLE "scan_quota_operations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" "AiUsageFeature" NOT NULL,
    "inputHash" TEXT NOT NULL,
    "subjectHash" TEXT,
    "attemptToken" TEXT NOT NULL,
    "status" "ScanQuotaOperationStatus" NOT NULL DEFAULT 'RESERVED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resultRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_quota_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_quota_requests" (
    "userId" TEXT NOT NULL,
    "feature" "AiUsageFeature" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_quota_requests_pkey" PRIMARY KEY ("userId","feature","idempotencyKey")
);

-- CreateIndex
CREATE INDEX "scan_quota_operations_userId_feature_status_expiresAt_idx" ON "scan_quota_operations"("userId", "feature", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "scan_quota_operations_id_userId_feature_key" ON "scan_quota_operations"("id", "userId", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_events_scanOperationId_key" ON "ai_usage_events"("scanOperationId");

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_scanOperationId_fkey" FOREIGN KEY ("scanOperationId") REFERENCES "scan_quota_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_quota_operations" ADD CONSTRAINT "scan_quota_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_quota_requests" ADD CONSTRAINT "scan_quota_requests_operationId_userId_feature_fkey" FOREIGN KEY ("operationId", "userId", "feature") REFERENCES "scan_quota_operations"("id", "userId", "feature") ON DELETE CASCADE ON UPDATE CASCADE;

-- SQL-only guards; do not count history/retry rows as successful usage.
-- Compare feature text to avoid using an enum label added in this transaction.
ALTER TABLE "scan_quota_operations" ADD CONSTRAINT "scan_quota_operations_shape_check" CHECK (
    "inputHash" ~ '^[0-9a-f]{64}$'
    AND (
        ("feature"::text = 'PHOTO_SCAN' AND "subjectHash" IS NULL)
        OR ("feature"::text = 'BARCODE_SCAN' AND "subjectHash" IS NOT NULL AND "subjectHash" = "inputHash")
    )
    AND (("status" = 'SUCCEEDED' AND "resultRef" IS NOT NULL)
         OR ("status" <> 'SUCCEEDED' AND "resultRef" IS NULL))
);

ALTER TABLE "scan_quota_requests" ADD CONSTRAINT "scan_quota_requests_shape_check" CHECK (
    "feature"::text IN ('PHOTO_SCAN', 'BARCODE_SCAN')
    AND "inputHash" ~ '^[0-9a-f]{64}$'
);

-- One successful/current barcode per account, even with different request keys.
-- Expired reservations are transitioned under the same account lock on demand.
CREATE UNIQUE INDEX "scan_quota_operations_live_barcode_key"
ON "scan_quota_operations" ("userId", "feature", "subjectHash")
WHERE "subjectHash" IS NOT NULL AND "status" IN ('RESERVED', 'SUCCEEDED');
