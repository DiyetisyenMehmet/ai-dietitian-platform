-- CreateEnum
CREATE TYPE "AccountIdentityOperationPurpose" AS ENUM ('LINK_METHOD', 'GOOGLE_TRANSITION');

-- CreateTable
CREATE TABLE "account_identity_operations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AccountIdentityOperationPurpose" NOT NULL,
    "kind" "AccountIdentityKind" NOT NULL,
    "identifier" VARCHAR(320) NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "securityStamp" TEXT NOT NULL,
    "proofHash" TEXT,
    "proofEventHash" TEXT,
    "reauthenticatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_identity_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_identity_operations_proofEventHash_key" ON "account_identity_operations"("proofEventHash");

-- CreateIndex
CREATE INDEX "account_identity_operations_userId_createdAt_idx" ON "account_identity_operations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "account_identity_operations_expiresAt_idx" ON "account_identity_operations"("expiresAt");

-- AddForeignKey
ALTER TABLE "account_identity_operations" ADD CONSTRAINT "account_identity_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "account_identity_operations" ADD CONSTRAINT "account_identity_operation_proof_shape"
CHECK (
  "sessionHash" ~ '^[a-f0-9]{64}$' AND "securityStamp" ~ '^[a-f0-9]{64}$'
  AND ("proofHash" IS NULL OR "proofHash" ~ '^[a-f0-9]{64}$')
  AND ("proofEventHash" IS NULL OR "proofEventHash" ~ '^[a-f0-9]{64}$')
  AND "failedAttempts" BETWEEN 0 AND 5
  AND ("purpose" <> 'GOOGLE_TRANSITION' OR ("kind" = 'GOOGLE' AND "proofHash" IS NOT NULL))
  AND ("kind" <> 'EMAIL' OR "consumedAt" IS NOT NULL OR "proofHash" IS NOT NULL)
);

-- Both legacy User.email and the verified registry share the SAME reservation
-- lock, including writers that do not use the new linking service. No data
-- backfill, rename, merge, password write or health-record write is performed.
CREATE FUNCTION account_identity_reservation_guard() RETURNS trigger AS $$
DECLARE
  identity_kind "AccountIdentityKind";
  identity_value text;
  owner_id text;
  legacy_email text;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    owner_id := NEW.id;
    IF TG_OP = 'UPDATE' AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
      RETURN NEW;
    END IF;
    IF lower(NEW.email) ~ '^phone\.[1-9][0-9]{7,14}@phone\.diewish\.invalid$' THEN
      identity_kind := 'PHONE';
      identity_value := '+' || split_part(split_part(lower(NEW.email), '@', 1), '.', 2);
    ELSIF lower(NEW.email) NOT LIKE '%.diewish.invalid' THEN
      identity_kind := 'EMAIL';
      identity_value := lower(btrim(NEW.email));
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    owner_id := NEW."userId";
    identity_kind := NEW.kind;
    identity_value := NEW.identifier;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('diewish-identity:' || identity_kind::text || ':' || identity_value, 0));
  IF TG_TABLE_NAME = 'users' THEN
    IF EXISTS (SELECT 1 FROM account_identities WHERE kind = identity_kind AND identifier = identity_value AND "userId" <> owner_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Account identity is already reserved';
    END IF;
  ELSE
    IF identity_kind = 'EMAIL' THEN
      legacy_email := identity_value;
    ELSIF identity_kind = 'PHONE' THEN
      legacy_email := 'phone.' || substring(identity_value FROM 2) || '@phone.diewish.invalid';
    ELSE
      RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE lower(btrim(email)) = legacy_email AND id <> owner_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Account identity is already reserved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER account_identity_reservation_on_user
  BEFORE INSERT OR UPDATE OF email ON "users"
  FOR EACH ROW EXECUTE FUNCTION account_identity_reservation_guard();
CREATE TRIGGER account_identity_reservation_on_registry
  BEFORE INSERT ON "account_identities"
  FOR EACH ROW EXECUTE FUNCTION account_identity_reservation_guard();
