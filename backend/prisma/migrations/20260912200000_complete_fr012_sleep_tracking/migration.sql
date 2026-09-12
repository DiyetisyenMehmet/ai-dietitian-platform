CREATE TABLE "sleep_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sleepStart" TIMESTAMP(3) NOT NULL,
  "wakeTime" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "quality" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sleep_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sleep_logs_quality_check" CHECK ("quality" BETWEEN 1 AND 5),
  CONSTRAINT "sleep_logs_duration_check" CHECK ("durationMinutes" >= 15 AND "durationMinutes" <= 1440),
  CONSTRAINT "sleep_logs_time_check" CHECK ("wakeTime" > "sleepStart"),
  CONSTRAINT "sleep_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "sleep_logs_userId_wakeTime_idx" ON "sleep_logs"("userId", "wakeTime");
