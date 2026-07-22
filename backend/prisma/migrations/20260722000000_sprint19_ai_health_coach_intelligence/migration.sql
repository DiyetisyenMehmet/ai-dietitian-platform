-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "AiMemoryType" AS ENUM ('WEIGHT_TREND', 'MEAL_HABITS', 'BLOOD_TESTS', 'GOALS', 'MISTAKES', 'ACHIEVEMENTS', 'ACTIVITY', 'CONVERSATION_SUMMARY');

-- CreateEnum
CREATE TYPE "ProactiveMessageType" AS ENUM ('MISSED_MEAL', 'MISSED_WEIGHT', 'GOAL_BEHIND', 'LOW_WATER', 'INACTIVITY', 'RISK_ALERT', 'WEEKLY_REVIEW', 'MONTHLY_REVIEW');

-- CreateEnum
CREATE TYPE "WeightTrend" AS ENUM ('IMPROVING', 'STABLE', 'DECLINING');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PROACTIVE_MESSAGE', 'WEEKLY_REVIEW', 'MONTHLY_REVIEW', 'RISK_ALERT', 'GOAL_REMINDER', 'WATER_REMINDER');

-- CreateTable
CREATE TABLE "weight_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "name" TEXT,
    "calories" DOUBLE PRECISION,
    "proteinG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "sodiumMg" DOUBLE PRECISION,
    "sugarG" DOUBLE PRECISION,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMl" INTEGER NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memoryType" "AiMemoryType" NOT NULL,
    "content" JSONB NOT NULL,
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ai_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation_summaries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "keyInsights" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proactive_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ProactiveMessageType" NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proactive_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "weightTrend" "WeightTrend" NOT NULL,
    "mealConsistency" INTEGER NOT NULL,
    "waterConsistency" INTEGER NOT NULL,
    "proteinConsistency" INTEGER NOT NULL,
    "coachComments" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "nextWeekPriorities" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "progressSummary" TEXT NOT NULL,
    "habitsAnalysis" TEXT NOT NULL,
    "improvements" JSONB NOT NULL,
    "riskAreas" JSONB NOT NULL,
    "aiEvaluation" TEXT NOT NULL,
    "motivationMessage" TEXT NOT NULL,
    "priorities" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weight_logs_userId_loggedAt_idx" ON "weight_logs"("userId", "loggedAt");

-- CreateIndex
CREATE INDEX "meal_logs_userId_loggedAt_idx" ON "meal_logs"("userId", "loggedAt");

-- CreateIndex
CREATE INDEX "water_logs_userId_loggedAt_idx" ON "water_logs"("userId", "loggedAt");

-- CreateIndex
CREATE INDEX "ai_memories_userId_memoryType_updatedAt_idx" ON "ai_memories"("userId", "memoryType", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_conversation_summaries_userId_year_weekNumber_idx" ON "ai_conversation_summaries"("userId", "year", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversation_summaries_userId_weekNumber_year_key" ON "ai_conversation_summaries"("userId", "weekNumber", "year");

-- CreateIndex
CREATE INDEX "proactive_messages_userId_isRead_scheduledFor_idx" ON "proactive_messages"("userId", "isRead", "scheduledFor");

-- CreateIndex
CREATE INDEX "weekly_reviews_userId_year_weekNumber_idx" ON "weekly_reviews"("userId", "year", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reviews_userId_weekNumber_year_key" ON "weekly_reviews"("userId", "weekNumber", "year");

-- CreateIndex
CREATE INDEX "monthly_reviews_userId_year_month_idx" ON "monthly_reviews"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reviews_userId_month_year_key" ON "monthly_reviews"("userId", "month", "year");

-- CreateIndex
CREATE INDEX "notifications_userId_scheduledFor_idx" ON "notifications"("userId", "scheduledFor");

-- CreateIndex
CREATE INDEX "notifications_deliveredAt_idx" ON "notifications"("deliveredAt");

-- AddForeignKey
ALTER TABLE "weight_logs" ADD CONSTRAINT "weight_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_summaries" ADD CONSTRAINT "ai_conversation_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proactive_messages" ADD CONSTRAINT "proactive_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reviews" ADD CONSTRAINT "monthly_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

