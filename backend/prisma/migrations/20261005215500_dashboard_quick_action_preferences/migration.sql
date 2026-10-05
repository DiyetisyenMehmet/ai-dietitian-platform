-- Extend the existing account-scoped Dashboard UI preference.
-- These arrays contain only stable UI IDs; no health or tracking data is stored.
ALTER TABLE "dashboard_card_preferences"
ADD COLUMN "quickActionOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "hiddenQuickActionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
