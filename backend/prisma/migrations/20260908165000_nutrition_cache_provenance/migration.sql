-- Extend the existing nutrition cache with refresh provenance without changing
-- the public nutrition model or storing user health/profile data.
ALTER TABLE "nutrition_foods"
  ADD COLUMN IF NOT EXISTS "last_validated_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "payload_hash" TEXT;

UPDATE "nutrition_foods"
SET "last_validated_at" = COALESCE("last_validated_at", "retrieved_at")
WHERE "last_validated_at" IS NULL;

CREATE INDEX IF NOT EXISTS "nutrition_foods_last_validated_idx"
  ON "nutrition_foods"("last_validated_at");
