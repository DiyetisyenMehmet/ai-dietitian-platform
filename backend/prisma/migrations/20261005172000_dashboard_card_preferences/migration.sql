-- Account-scoped UI preference only. No health data is stored here.
CREATE TABLE "dashboard_card_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cardOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "hiddenCardIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dashboard_card_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_card_preferences_userId_key"
ON "dashboard_card_preferences"("userId");

ALTER TABLE "dashboard_card_preferences"
ADD CONSTRAINT "dashboard_card_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
