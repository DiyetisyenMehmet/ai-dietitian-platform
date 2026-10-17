-- AlterTable
ALTER TABLE "nutrition_plans" ADD COLUMN     "originPlanId" TEXT;
ALTER TABLE "nutrition_plans" ADD COLUMN "nutritionContextHash" TEXT;

-- CreateTable
CREATE TABLE "nutrition_generation_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "duration" "NutritionPlanDuration" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "requestKey" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "input" JSONB,
    "startDate" DATE NOT NULL,
    "basePlanId" TEXT,
    "baseStateHash" TEXT,
    "sourcePlanId" TEXT,
    "revisionMode" TEXT,
    "dayNumber" INTEGER,
    "mealIndex" INTEGER,
    "completedDays" INTEGER NOT NULL DEFAULT 0,
    "claimToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" TEXT,
    "deliveredPlanId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_job_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,

    CONSTRAINT "nutrition_job_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_generation_batches" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "startDayNumber" INTEGER NOT NULL,
    "dayCount" INTEGER NOT NULL,
    "output" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nutrition_generation_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_rights_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "originPlanId" TEXT,
    "dayNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nutrition_rights_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_worker_attempts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "claimToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "provider" TEXT,
    "model" TEXT,
    "elapsedMs" INTEGER,
    "providerCalls" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "thinkingTokens" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nutrition_worker_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nutrition_generation_jobs_status_nextAttemptAt_leaseUntil_idx" ON "nutrition_generation_jobs"("status", "nextAttemptAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "nutrition_generation_jobs_userId_updatedAt_idx" ON "nutrition_generation_jobs"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_generation_jobs_userId_requestKey_key" ON "nutrition_generation_jobs"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_job_requests_userId_requestKey_key" ON "nutrition_job_requests"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_generation_batches_jobId_startDayNumber_key" ON "nutrition_generation_batches"("jobId", "startDayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_rights_events_jobId_key" ON "nutrition_rights_events"("jobId");

-- CreateIndex
CREATE INDEX "nutrition_rights_events_userId_kind_createdAt_idx" ON "nutrition_rights_events"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "nutrition_rights_events_userId_originPlanId_dayNumber_kind_idx" ON "nutrition_rights_events"("userId", "originPlanId", "dayNumber", "kind");

-- CreateIndex
CREATE INDEX "nutrition_worker_attempts_createdAt_idx" ON "nutrition_worker_attempts"("createdAt");

-- AddForeignKey
ALTER TABLE "nutrition_generation_jobs" ADD CONSTRAINT "nutrition_generation_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_job_requests" ADD CONSTRAINT "nutrition_job_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_job_requests" ADD CONSTRAINT "nutrition_job_requests_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "nutrition_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_generation_batches" ADD CONSTRAINT "nutrition_generation_batches_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "nutrition_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_rights_events" ADD CONSTRAINT "nutrition_rights_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_rights_events" ADD CONSTRAINT "nutrition_rights_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "nutrition_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_worker_attempts" ADD CONSTRAINT "nutrition_worker_attempts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "nutrition_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database authority across workers and requests; paused checkpoints remain reusable.
CREATE UNIQUE INDEX "nutrition_jobs_one_active_user" ON "nutrition_generation_jobs"("userId")
WHERE "status" IN ('QUEUED','RUNNING','RETRY_WAIT','READY');
ALTER TABLE "nutrition_generation_jobs" ADD CONSTRAINT "nutrition_job_state_check"
CHECK ("status" IN ('QUEUED','RUNNING','RETRY_WAIT','READY','CONSUMED','PAUSED','FAILED','INVALIDATED','EXPIRED'));
ALTER TABLE "nutrition_generation_jobs" ADD CONSTRAINT "nutrition_job_kind_check"
CHECK ("kind" IN ('NEW_PLAN','MEAL_CHANGE'));
ALTER TABLE "nutrition_generation_batches" ADD CONSTRAINT "nutrition_batch_range_check"
CHECK ("startDayNumber" BETWEEN 1 AND 30 AND "dayCount" BETWEEN 1 AND 5);

