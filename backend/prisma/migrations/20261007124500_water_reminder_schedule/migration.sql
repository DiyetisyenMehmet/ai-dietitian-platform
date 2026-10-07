-- Extend the existing account preferences; legacy single-time records stay valid.
ALTER TABLE "notification_preferences"
ADD COLUMN "waterReminderSchedule" JSONB;
