-- User-scoped food-photo scan history.
-- This is intentionally separate from meal logs and from the Progress/History domain:
-- scanning a food does not mean the user consumed it.

CREATE TABLE IF NOT EXISTS "nutrition_photo_scans" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "dish_name" TEXT NOT NULL,
  "portion_text" TEXT,
  "portion_grams" DOUBLE PRECISION,
  "calories" DOUBLE PRECISION,
  "payload" JSONB NOT NULL,
  "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nutrition_photo_scans_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "nutrition_photo_scans_user_scanned_idx"
  ON "nutrition_photo_scans"("user_id", "scanned_at" DESC);
