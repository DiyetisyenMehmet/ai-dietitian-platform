ALTER TABLE "users" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "password_reset_deliveries" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    CONSTRAINT "password_reset_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "password_reset_deliveries_completedAt_requestedAt_idx" ON "password_reset_deliveries"("completedAt", "requestedAt");
