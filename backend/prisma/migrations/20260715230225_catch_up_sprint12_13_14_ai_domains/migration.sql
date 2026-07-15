-- CreateEnum
CREATE TYPE "BloodTestAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReferenceRangeGender" AS ENUM ('MALE', 'FEMALE', 'ALL');

-- CreateEnum
CREATE TYPE "NutritionPlanDuration" AS ENUM ('THIRTY_DAY', 'SIXTY_DAY');

-- CreateEnum
CREATE TYPE "NutritionPlanStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PREMIUM', 'PRO');

-- CreateEnum
CREATE TYPE "AiUsageFeature" AS ENUM ('DIETITIAN_CHAT', 'BLOOD_TEST_ANALYSIS', 'NUTRITION_PLAN');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "blood_test_analyses" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bloodTestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BloodTestAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "extractionMethod" TEXT,
    "rawExtractedText" TEXT,
    "normalizedValues" JSONB NOT NULL,
    "abnormalValues" JSONB NOT NULL,
    "abnormalCount" INTEGER NOT NULL DEFAULT 0,
    "aiExplanations" JSONB NOT NULL,
    "nutritionImplications" JSONB NOT NULL,
    "overallRecommendations" JSONB NOT NULL,
    "summary" TEXT,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "processingTimeMs" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "blood_test_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_test_reference_ranges" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "biomarkerCode" TEXT NOT NULL,
    "biomarkerName" TEXT NOT NULL,
    "biomarkerNameTr" TEXT,
    "unit" TEXT NOT NULL,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "optimalMin" DOUBLE PRECISION,
    "optimalMax" DOUBLE PRECISION,
    "gender" "ReferenceRangeGender" NOT NULL DEFAULT 'ALL',
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "country" TEXT,
    "laboratoryId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'STANDARD',
    "notes" TEXT,

    CONSTRAINT "blood_test_reference_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_plans" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "bloodTestAnalysisId" TEXT,
    "duration" "NutritionPlanDuration" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "NutritionPlanStatus" NOT NULL DEFAULT 'COMPLETED',
    "bmr" DOUBLE PRECISION NOT NULL,
    "tdee" DOUBLE PRECISION NOT NULL,
    "dailyCalories" DOUBLE PRECISION NOT NULL,
    "proteinGrams" DOUBLE PRECISION NOT NULL,
    "carbsGrams" DOUBLE PRECISION NOT NULL,
    "fatGrams" DOUBLE PRECISION NOT NULL,
    "waterMl" DOUBLE PRECISION NOT NULL,
    "mealsPerDay" INTEGER NOT NULL,
    "mealTiming" JSONB NOT NULL,
    "dailyPlans" JSONB NOT NULL,
    "explanations" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "summary" TEXT,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "processingTimeMs" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "nutrition_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" "AiUsageFeature" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "estimatedTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blood_test_analyses_bloodTestId_key" ON "blood_test_analyses"("bloodTestId");

-- CreateIndex
CREATE INDEX "blood_test_analyses_userId_idx" ON "blood_test_analyses"("userId");

-- CreateIndex
CREATE INDEX "blood_test_analyses_bloodTestId_idx" ON "blood_test_analyses"("bloodTestId");

-- CreateIndex
CREATE INDEX "blood_test_reference_ranges_biomarkerCode_idx" ON "blood_test_reference_ranges"("biomarkerCode");

-- CreateIndex
CREATE INDEX "blood_test_reference_ranges_isActive_idx" ON "blood_test_reference_ranges"("isActive");

-- CreateIndex
CREATE INDEX "nutrition_plans_userId_idx" ON "nutrition_plans"("userId");

-- CreateIndex
CREATE INDEX "nutrition_plans_userId_duration_isActive_idx" ON "nutrition_plans"("userId", "duration", "isActive");

-- CreateIndex
CREATE INDEX "ai_usage_events_userId_feature_createdAt_idx" ON "ai_usage_events"("userId", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "chat_conversations_userId_idx" ON "chat_conversations"("userId");

-- CreateIndex
CREATE INDEX "chat_messages_conversationId_createdAt_idx" ON "chat_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "blood_test_analyses" ADD CONSTRAINT "blood_test_analyses_bloodTestId_fkey" FOREIGN KEY ("bloodTestId") REFERENCES "blood_test_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_test_analyses" ADD CONSTRAINT "blood_test_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
