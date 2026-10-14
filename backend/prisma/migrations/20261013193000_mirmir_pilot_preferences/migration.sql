-- Additive UI preferences only. Existing card/quick-action preferences are preserved.
ALTER TABLE "dashboard_card_preferences"
  ADD COLUMN "mascotId" TEXT NOT NULL DEFAULT 'classic',
  ADD COLUMN "mascotAnimation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "dashboard_card_preferences"
  ADD CONSTRAINT "dashboard_card_preferences_mascot_id_check"
  CHECK ("mascotId" IN ('classic', 'mirmir'));
