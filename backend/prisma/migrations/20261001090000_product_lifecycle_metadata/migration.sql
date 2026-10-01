-- Product lifecycle metadata extends the existing Diewish product catalog.
-- Existing products and scan-history snapshots are not deleted or rewritten.
ALTER TABLE "nutrition_foods"
  ADD COLUMN IF NOT EXISTS "lifecycle_status" TEXT,
  ADD COLUMN IF NOT EXISTS "lifecycle_replaced_by_variant_key" TEXT,
  ADD COLUMN IF NOT EXISTS "lifecycle_replaced_by_barcode" TEXT,
  ADD COLUMN IF NOT EXISTS "lifecycle_source_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "lifecycle_effective_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "nutrition_foods_lifecycle_status_idx"
  ON "nutrition_foods"("lifecycle_status");

CREATE INDEX IF NOT EXISTS "nutrition_foods_family_lifecycle_idx"
  ON "nutrition_foods"("product_family_key", "lifecycle_status");
