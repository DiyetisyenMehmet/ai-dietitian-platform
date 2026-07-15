-- CreateEnum
CREATE TYPE "BloodTestStatus" AS ENUM ('UPLOADED', 'ANALYZING', 'ANALYZED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'BLOOD_TEST_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'BLOOD_TEST_REPLACED';
ALTER TYPE "AuditAction" ADD VALUE 'BLOOD_TEST_DELETED';

-- CreateTable
CREATE TABLE "blood_test_uploads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BloodTestStatus" NOT NULL DEFAULT 'UPLOADED',
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "label" TEXT,
    "testDate" DATE,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blood_test_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blood_test_uploads_userId_idx" ON "blood_test_uploads"("userId");

-- CreateIndex
CREATE INDEX "blood_test_uploads_userId_status_idx" ON "blood_test_uploads"("userId", "status");

-- AddForeignKey
ALTER TABLE "blood_test_uploads" ADD CONSTRAINT "blood_test_uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
