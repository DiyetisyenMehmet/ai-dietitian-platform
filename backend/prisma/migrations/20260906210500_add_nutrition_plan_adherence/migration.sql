-- Add durable nutrition-plan schedule metadata and soft-delete support.
ALTER TABLE "nutrition_plans"
  ADD COLUMN "startDate" DATE,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "nutrition_plans"
SET "startDate" = ("createdAt" AT TIME ZONE 'UTC')::date
WHERE "startDate" IS NULL;

ALTER TABLE "nutrition_plans"
  ALTER COLUMN "startDate" SET NOT NULL,
  ALTER COLUMN "startDate" SET DEFAULT CURRENT_DATE;

-- Kaçamak/adherence records are stored separately so completed plan content
-- remains immutable and historical plan versions are never rewritten.
CREATE TYPE "NutritionPlanDeviationScope" AS ENUM ('FOOD', 'MEAL', 'DAY');
CREATE TYPE "NutritionPlanDeviationType" AS ENUM ('SKIPPED', 'REPLACED', 'EXTRA', 'PORTION_CHANGED');

CREATE TABLE "nutrition_plan_deviations" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "dayNumber" INTEGER NOT NULL,
  "mealIndex" INTEGER,
  "foodIndex" INTEGER,
  "scope" "NutritionPlanDeviationScope" NOT NULL,
  "type" "NutritionPlanDeviationType" NOT NULL,
  "plannedItemName" TEXT,
  "actualItemName" TEXT,
  "plannedPortion" TEXT,
  "actualPortion" TEXT,
  "note" TEXT,
  CONSTRAINT "nutrition_plan_deviations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "nutrition_plans_userId_deletedAt_idx"
  ON "nutrition_plans"("userId", "deletedAt");

CREATE INDEX "nutrition_plan_deviations_userId_createdAt_idx"
  ON "nutrition_plan_deviations"("userId", "createdAt");

CREATE INDEX "nutrition_plan_deviations_planId_dayNumber_idx"
  ON "nutrition_plan_deviations"("planId", "dayNumber");

ALTER TABLE "nutrition_plan_deviations"
  ADD CONSTRAINT "nutrition_plan_deviations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nutrition_plan_deviations"
  ADD CONSTRAINT "nutrition_plan_deviations_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "nutrition_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
