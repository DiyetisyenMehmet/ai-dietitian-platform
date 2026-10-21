-- Extend the existing visual preference only; no rows or defaults are changed.
BEGIN;
ALTER TABLE "dashboard_card_preferences"
  DROP CONSTRAINT "dashboard_card_preferences_mascot_id_check",
  ADD CONSTRAINT "dashboard_card_preferences_mascot_id_check"
    CHECK ("mascotId" IN ('classic', 'mirmir', 'dost'));
COMMIT;
