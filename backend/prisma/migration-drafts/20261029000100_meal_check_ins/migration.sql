-- REVIEW DRAFT: outside prisma/migrations, never automatically deployed.
-- Shared database application needs separate approval. Local synthetic tests only.
CREATE TYPE "MealCheckInState" AS ENUM ('PENDING', 'EATEN', 'SKIPPED');
CREATE UNIQUE INDEX "nutrition_plans_checkin_owner_key" ON "nutrition_plans"("id", "userId");
CREATE TABLE "meal_check_ins" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "dayNumber" INTEGER NOT NULL CHECK ("dayNumber" BETWEEN 1 AND 60),
  "mealIndex" INTEGER NOT NULL CHECK ("mealIndex" BETWEEN 0 AND 11),
  "localDate" DATE NOT NULL,
  "state" "MealCheckInState" NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" BETWEEN 1 AND 2147483646),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "meal_check_ins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "meal_check_ins_identity_key"
  ON "meal_check_ins"("userId", "planId", "dayNumber", "mealIndex", "localDate");
ALTER TABLE "meal_check_ins" ADD CONSTRAINT "meal_check_ins_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meal_check_ins" ADD CONSTRAINT "meal_check_ins_planId_userId_fkey"
  FOREIGN KEY ("planId", "userId") REFERENCES "nutrition_plans"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
