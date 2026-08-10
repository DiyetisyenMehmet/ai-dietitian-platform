import type { ChatConversation, ChatMessage } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/** A conversation together with its ordered messages. */
export type ConversationWithMessages = ChatConversation & { messages: ChatMessage[] };

/** The assistant reply metadata persisted alongside a turn. */
export interface AssistantTurnData {
  content: string;
  provider: string;
  model: string;
}

/**
 * Data-access layer for AI Dietitian Chat. All reads are owner-scoped by
 * `userId` so a user can never access another user's conversation.
 */
export const aiChatRepository = {
  /** Creates a new (empty) conversation for a user. */
  createConversation(userId: string, title: string | null): Promise<ChatConversation> {
    return prisma.chatConversation.create({ data: { userId, title } });
  },

  /** Fetches a conversation (no messages), scoped to the user. */
  findConversation(id: string, userId: string): Promise<ChatConversation | null> {
    return prisma.chatConversation.findFirst({ where: { id, userId } });
  },

  /** Fetches a conversation with all its messages (oldest first), owner-scoped. */
  findConversationWithMessages(
    id: string,
    userId: string,
  ): Promise<ConversationWithMessages | null> {
    return prisma.chatConversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  },

  /** Lists a user's conversations, most recently updated first. */
  listConversations(userId: string): Promise<ChatConversation[]> {
    return prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
  },

  /**
   * Returns the most recent messages of a conversation in chronological order
   * (oldest first), capped at `limit`.
   */
  async getRecentMessages(conversationId: string, limit: number): Promise<ChatMessage[]> {
    const rows = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.reverse();
  },

  /**
   * Persists a user message and the assistant reply atomically, and touches the
   * conversation (updatedAt, and title when it is still unset). Returns the
   * saved assistant message.
   */
  async appendTurn(
    conversationId: string,
    userContent: string,
    assistant: AssistantTurnData,
    title?: string,
  ): Promise<ChatMessage> {
    return prisma.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: { conversationId, role: "USER", content: userContent },
      });
      const assistantMessage = await tx.chatMessage.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: assistant.content,
          provider: assistant.provider,
          model: assistant.model,
        },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date(), ...(title ? { title } : {}) },
      });
      return assistantMessage;
    });
  },

  /** Deletes a conversation (and its messages via cascade), owner-scoped. */
  async deleteConversation(id: string, userId: string): Promise<boolean> {
    const result = await prisma.chatConversation.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },
};
