-- Expand existing visual preferences only. No stored identities or defaults are rewritten.
BEGIN;
ALTER TABLE "dashboard_card_preferences"
  DROP CONSTRAINT "dashboard_card_preferences_mascot_id_check",
  ADD CONSTRAINT "dashboard_card_preferences_mascot_id_check"
    CHECK ("mascotId" IN ('classic', 'diewish-robot', 'minis', 'bilge', 'enerjik', 'lina', 'bulut', 'yesil-damla', 'minik-bulut', 'mirmir', 'dost', 'nox', 'fit', 'guclu', 'tombis', 'mini-robot'));
COMMIT;
