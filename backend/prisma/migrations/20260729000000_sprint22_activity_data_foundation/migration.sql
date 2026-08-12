-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('WALKING', 'RUNNING', 'CYCLING', 'SWIMMING', 'STRENGTH_TRAINING', 'YOGA', 'HIIT', 'SPORTS', 'OTHER');

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "name" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "caloriesBurned" DOUBLE PRECISION,
    "note" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_userId_loggedAt_idx" ON "activities"("userId", "loggedAt");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
