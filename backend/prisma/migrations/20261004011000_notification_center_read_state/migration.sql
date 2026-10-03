-- Persist in-app notification read state without changing delivery semantics.
ALTER TABLE "notifications"
ADD COLUMN "readAt" TIMESTAMP(3);

CREATE INDEX "notifications_userId_readAt_scheduledFor_idx"
ON "notifications"("userId", "readAt", "scheduledFor");
