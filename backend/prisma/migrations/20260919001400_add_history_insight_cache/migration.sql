-- Derived AI insight cache for History. This is not a health source-of-truth
-- and intentionally duplicates no meal, water, activity, sleep or weight rows.
CREATE TYPE "HistoryInsightScope" AS ENUM ('DAY', 'WEEK', 'MONTH');
CREATE TYPE "HistoryInsightSource" AS ENUM ('AI', 'RULE_BASED');

CREATE TABLE "history_insights" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scope" "HistoryInsightScope" NOT NULL,
  "periodKey" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "contextHash" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "source" "HistoryInsightSource" NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "history_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "history_insights_userId_scope_periodKey_timezone_key"
  ON "history_insights"("userId", "scope", "periodKey", "timezone");

CREATE INDEX "history_insights_userId_scope_updatedAt_idx"
  ON "history_insights"("userId", "scope", "updatedAt");

ALTER TABLE "history_insights"
  ADD CONSTRAINT "history_insights_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
