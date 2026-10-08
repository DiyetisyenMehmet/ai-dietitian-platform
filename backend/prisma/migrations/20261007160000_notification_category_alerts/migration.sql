-- Optional, platform-neutral account preferences. Device permissions and tokens
-- stay in the existing device infrastructure. Legacy rows retain their settings.
ALTER TABLE "notification_preferences" ADD COLUMN "categoryAlerts" JSONB;
