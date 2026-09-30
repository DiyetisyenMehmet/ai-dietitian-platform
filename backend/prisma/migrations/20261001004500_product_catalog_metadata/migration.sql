-- Add normalized catalog metadata to the existing Diewish nutrition product store.
-- Existing payloads and scan snapshots are not rewritten. Nullable columns allow
-- legacy products to remain unclassified until sufficient trusted data is seen.
ALTER TABLE "nutrition_foods"
  ADD COLUMN IF NOT EXISTS "catalog_category_key" TEXT,
  ADD COLUMN IF NOT EXISTS "catalog_subcategory_key" TEXT,
  ADD COLUMN IF NOT EXISTS "catalog_brand_key" TEXT,
  ADD COLUMN IF NOT EXISTS "product_family_key" TEXT,
  ADD COLUMN IF NOT EXISTS "product_variant_key" TEXT;

CREATE INDEX IF NOT EXISTS "nutrition_foods_catalog_category_idx"
  ON "nutrition_foods"("catalog_category_key");

CREATE INDEX IF NOT EXISTS "nutrition_foods_catalog_brand_idx"
  ON "nutrition_foods"("catalog_brand_key");

CREATE INDEX IF NOT EXISTS "nutrition_foods_product_family_idx"
  ON "nutrition_foods"("product_family_key");

CREATE INDEX IF NOT EXISTS "nutrition_foods_product_variant_idx"
  ON "nutrition_foods"("product_variant_key");
