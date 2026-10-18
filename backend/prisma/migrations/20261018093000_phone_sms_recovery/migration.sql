-- Extend existing one-time phone operation state; never infer a recovery phone.
ALTER TABLE phone_password_challenges
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'INITIAL_PASSWORD',
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "proofEventHash" DROP NOT NULL;
ALTER TABLE phone_password_challenges ADD CONSTRAINT phone_operation_purpose CHECK (
  purpose IN ('INITIAL_PASSWORD', 'SMS_PASSWORD_RESET')
  AND "failedAttempts" BETWEEN 0 AND 5
  AND (purpose <> 'INITIAL_PASSWORD' OR "proofEventHash" IS NOT NULL)
  AND ("verifiedAt" IS NULL OR ("expectedUserId" IS NOT NULL AND "securityStamp" IS NOT NULL AND "proofEventHash" IS NOT NULL))
);
-- A4 proves its fresh SMS after intent creation, so protect event updates too.
DROP TRIGGER phone_password_proof_guard ON phone_password_challenges;
CREATE TRIGGER phone_password_proof_guard BEFORE INSERT OR UPDATE OF "proofEventHash" ON phone_password_challenges
  FOR EACH ROW EXECUTE FUNCTION phone_password_event_guard();
