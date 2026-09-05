-- Persist conversation pinning across devices without overloading title or client storage.
-- `pinnedAt` also provides deterministic ordering among pinned conversations.

-- AlterTable
ALTER TABLE "chat_conversations"
ADD COLUMN "pinnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "chat_conversations_userId_pinnedAt_idx"
ON "chat_conversations"("userId", "pinnedAt");
