-- Notification delivery state is kept separate from notification content so
-- retries, partial multi-device delivery and terminal failures can be tracked
-- without changing the user-visible notification record.
CREATE TABLE "notification_delivery_state" (
    "notificationId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" VARCHAR(120),
    "deliveredDeviceKeys" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "claimId" VARCHAR(64),
    "claimedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_state_pkey" PRIMARY KEY ("notificationId"),
    CONSTRAINT "notification_delivery_state_notificationId_fkey"
      FOREIGN KEY ("notificationId") REFERENCES "notifications"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "notification_delivery_state_retry_idx"
  ON "notification_delivery_state"("failedAt", "nextAttemptAt", "claimedUntil");

-- Process-local scheduler memory is insufficient on multi-instance Cloud Run.
-- A unique slot/day claim makes recurring coach jobs single-owner per day.
CREATE TABLE "scheduler_job_runs" (
    "slot" VARCHAR(80) NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduler_job_runs_pkey" PRIMARY KEY ("slot", "dayKey")
);
