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

/** Result of atomically creating a conversation together with its first turn. */
export interface CreatedConversationTurn {
  conversation: ChatConversation;
  assistantMessage: ChatMessage;
}

/**
 * Data-access layer for AI Dietitian Chat. All reads and conversation mutations
 * are owner-scoped by `userId` so a user can never access another user's thread.
 */
export const aiChatRepository = {
  /** Creates a new (empty) conversation for a user. */
  createConversation(userId: string, title: string | null): Promise<ChatConversation> {
    return prisma.chatConversation.create({ data: { userId, title } });
  },

  /**
   * Creates a conversation and its first user/assistant turn in ONE transaction.
   * A provider or persistence failure can therefore never leave an empty,
   * orphaned conversation visible in the user's history.
   */
  async createConversationWithTurn(
    userId: string,
    title: string,
    userContent: string,
    assistant: AssistantTurnData,
  ): Promise<CreatedConversationTurn> {
    return prisma.$transaction(async (tx) => {
      const conversation = await tx.chatConversation.create({ data: { userId, title } });
      await tx.chatMessage.create({
        data: { conversationId: conversation.id, role: "USER", content: userContent },
      });
      const assistantMessage = await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: assistant.content,
          provider: assistant.provider,
          model: assistant.model,
        },
      });
      return { conversation, assistantMessage };
    });
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

  /** Renames one conversation after proving ownership. */
  async renameConversation(
    id: string,
    userId: string,
    title: string,
  ): Promise<ChatConversation | null> {
    const existing = await prisma.chatConversation.findFirst({ where: { id, userId } });
    if (!existing) return null;

    return prisma.chatConversation.update({
      where: { id },
      data: { title },
    });
  },

  /** Sets or clears a persistent pin, owner-scoped at mutation time. */
  async setConversationPinned(
    id: string,
    userId: string,
    pinned: boolean,
  ): Promise<ChatConversation | null> {
    const result = await prisma.chatConversation.updateMany({
      where: { id, userId },
      data: { pinnedAt: pinned ? new Date() : null },
    });
    if (result.count === 0) return null;

    return prisma.chatConversation.findFirst({ where: { id, userId } });
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
