-- Add nullable local wall-clock preferences for personalized meal timing.
-- Existing users remain valid until they provide these values.
ALTER TABLE "user_profiles"
ADD COLUMN "usualWakeTime" TEXT,
ADD COLUMN "usualSleepTime" TEXT;
