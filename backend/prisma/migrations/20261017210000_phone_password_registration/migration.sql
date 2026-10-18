-- Additive pending-operation state only. No existing account or identity backfill.
CREATE TABLE "phone_password_challenges" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "phoneNumber" VARCHAR(16) NOT NULL,
  "secretHash" TEXT NOT NULL UNIQUE,
  "proofEventHash" TEXT NOT NULL UNIQUE,
  "expectedUserId" TEXT,
  "securityStamp" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT phone_password_challenge_shape CHECK (
    "phoneNumber" ~ '^\+[1-9][0-9]{7,14}$'
    AND "secretHash" ~ '^[a-f0-9]{64}$'
    AND "proofEventHash" ~ '^[a-f0-9]{64}$'
    AND (("expectedUserId" IS NULL AND "securityStamp" IS NULL)
      OR ("expectedUserId" IS NOT NULL AND "securityStamp" ~ '^[a-f0-9]{64}$'))
    AND "expiresAt" <= "createdAt" + interval '5 minutes'
  )
);
CREATE INDEX "phone_password_challenges_expiresAt_idx" ON "phone_password_challenges"("expiresAt");
CREATE TABLE "phone_password_budgets" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL,
  CONSTRAINT phone_password_budget_shape CHECK ("key" ~ '^[a-f0-9]{64}$' AND "attempts" > 0)
);
-- One Firebase SMS authentication event cannot authorize two different flows.
-- This shares replay protection with accepted A2 without changing its service.
CREATE FUNCTION phone_password_event_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."proofEventHash" IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('diewish-proof-event:' || NEW."proofEventHash", 0));
  IF TG_TABLE_NAME = 'phone_password_challenges' THEN
    IF EXISTS (SELECT 1 FROM account_identity_operations WHERE "proofEventHash" = NEW."proofEventHash") THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Authentication proof is already used';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM phone_password_challenges WHERE "proofEventHash" = NEW."proofEventHash") THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Authentication proof is already used';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER phone_password_proof_guard BEFORE INSERT ON phone_password_challenges
  FOR EACH ROW EXECUTE FUNCTION phone_password_event_guard();
CREATE TRIGGER account_link_phone_proof_guard BEFORE INSERT OR UPDATE OF "proofEventHash" ON account_identity_operations
  FOR EACH ROW EXECUTE FUNCTION phone_password_event_guard();
