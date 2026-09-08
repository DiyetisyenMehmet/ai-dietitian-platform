-- Diewish Nutrition Intelligence persistent cache/history foundation.
-- Provider payloads are cached server-side only; no user health/profile data is stored here.

CREATE TABLE IF NOT EXISTS "nutrition_foods" (
  "id" BIGSERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "barcode" TEXT,
  "name" TEXT NOT NULL,
  "display_name_tr" TEXT NOT NULL,
  "brand" TEXT,
  "payload" JSONB NOT NULL,
  "retrieved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nutrition_foods_provider_external_id_key" UNIQUE ("provider", "external_id")
);

CREATE INDEX IF NOT EXISTS "nutrition_foods_barcode_idx" ON "nutrition_foods"("barcode");
CREATE INDEX IF NOT EXISTS "nutrition_foods_expires_at_idx" ON "nutrition_foods"("expires_at");
CREATE INDEX IF NOT EXISTS "nutrition_foods_display_name_tr_idx" ON "nutrition_foods"("display_name_tr");

CREATE TABLE IF NOT EXISTS "nutrition_food_aliases" (
  "id" BIGSERIAL PRIMARY KEY,
  "alias" TEXT NOT NULL,
  "normalized_alias" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nutrition_food_aliases_unique" UNIQUE ("normalized_alias", "provider", "external_id")
);

CREATE INDEX IF NOT EXISTS "nutrition_food_aliases_normalized_idx" ON "nutrition_food_aliases"("normalized_alias");

CREATE TABLE IF NOT EXISTS "nutrition_barcode_scans" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "provider" TEXT,
  "product_name" TEXT,
  "payload" JSONB,
  "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nutrition_barcode_scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "nutrition_barcode_scans_user_scanned_idx" ON "nutrition_barcode_scans"("user_id", "scanned_at" DESC);
CREATE INDEX IF NOT EXISTS "nutrition_barcode_scans_barcode_idx" ON "nutrition_barcode_scans"("barcode");

CREATE TABLE IF NOT EXISTS "nutrition_food_favorites" (
  "user_id" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "provider" TEXT,
  "product_name" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "barcode"),
  CONSTRAINT "nutrition_food_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "nutrition_food_favorites_user_created_idx" ON "nutrition_food_favorites"("user_id", "created_at" DESC);
