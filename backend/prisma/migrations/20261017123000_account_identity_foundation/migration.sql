-- CreateEnum
CREATE TYPE "AccountIdentityKind" AS ENUM ('EMAIL', 'PHONE', 'GOOGLE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hasUsablePassword" BOOLEAN;

-- CreateTable
CREATE TABLE "account_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AccountIdentityKind" NOT NULL,
    "identifier" VARCHAR(320) NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_identities_kind_identifier_key" ON "account_identities"("kind", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "account_identities_userId_kind_key" ON "account_identities"("userId", "kind");

-- AddForeignKey
ALTER TABLE "account_identities" ADD CONSTRAINT "account_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An identifier's owner/meaning must never be reassigned by an UPDATE/upsert.
-- Future approved unlink/relink flows need their own explicit proof lifecycle.
CREATE FUNCTION account_identity_prevent_reassignment() RETURNS trigger AS $$
BEGIN
  IF NEW."userId" <> OLD."userId" OR NEW."kind" <> OLD."kind"
     OR NEW."identifier" <> OLD."identifier" THEN
    RAISE EXCEPTION 'Account identity reassignment is forbidden';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER account_identity_immutable_owner
  BEFORE UPDATE ON "account_identities"
  FOR EACH ROW EXECUTE FUNCTION account_identity_prevent_reassignment();

ALTER TABLE "account_identities" ADD CONSTRAINT "account_identity_identifier_format"
CHECK (
  ("kind" = 'EMAIL' AND "identifier" = lower(btrim("identifier"))
    AND "identifier" LIKE '%@%' AND "identifier" NOT LIKE '%.diewish.invalid')
  OR ("kind" = 'PHONE' AND "identifier" ~ '^\+[1-9][0-9]{7,14}$')
  OR ("kind" = 'GOOGLE' AND "identifier" ~ '^[A-Za-z0-9_-]{1,255}$')
);
