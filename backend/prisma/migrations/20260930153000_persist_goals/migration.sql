CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startValue" DOUBLE PRECISION NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "startDate" DATE NOT NULL,
    "targetDate" DATE NOT NULL,
    "reminderTime" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goals_type_check" CHECK ("type" IN (
      'lose-weight',
      'gain-weight',
      'maintain-weight',
      'daily-calories',
      'protein',
      'water',
      'steps',
      'exercise'
    ))
);

CREATE INDEX "goals_userId_createdAt_idx" ON "goals"("userId", "createdAt");
CREATE INDEX "goals_userId_type_idx" ON "goals"("userId", "type");

ALTER TABLE "goals"
ADD CONSTRAINT "goals_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
