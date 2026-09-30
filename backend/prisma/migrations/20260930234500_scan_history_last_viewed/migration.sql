-- Scan-event timestamps remain immutable facts. last_viewed_at is UI interaction
-- metadata used only to order history cards by most recent user interaction.

ALTER TABLE "nutrition_barcode_scans"
  ADD COLUMN IF NOT EXISTS "last_viewed_at" TIMESTAMPTZ;

ALTER TABLE "nutrition_photo_scans"
  ADD COLUMN IF NOT EXISTS "last_viewed_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "nutrition_barcode_scans_user_activity_idx"
  ON "nutrition_barcode_scans"("user_id", COALESCE("last_viewed_at", "scanned_at") DESC);

CREATE INDEX IF NOT EXISTS "nutrition_photo_scans_user_activity_idx"
  ON "nutrition_photo_scans"("user_id", COALESCE("last_viewed_at", "scanned_at") DESC);
