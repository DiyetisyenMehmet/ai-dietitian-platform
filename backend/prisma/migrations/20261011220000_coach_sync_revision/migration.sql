-- One owner-scoped watermark; no message or health content is duplicated.
CREATE TABLE "coach_sync_revisions" (
  "user_id" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "version" BIGINT NOT NULL DEFAULT 0 CHECK ("version" >= 0)
);
