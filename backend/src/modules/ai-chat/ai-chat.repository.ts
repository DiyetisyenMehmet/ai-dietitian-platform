import type { ChatConversation, ChatMessage } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { publishCoachChange, recordCoachChange } from "./coach-events";

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
  async createConversation(userId: string, title: string | null): Promise<ChatConversation> {
    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.chatConversation.create({ data: { userId, title } });
      const change = await recordCoachChange(tx, userId, conversation.id, "created");
      return { conversation, change };
    });
    publishCoachChange(result.change);
    return result.conversation;
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
    const result = await prisma.$transaction(async (tx) => {
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
      const change = await recordCoachChange(tx, userId, conversation.id, "created");
      return { conversation, assistantMessage, change };
    });
    publishCoachChange(result.change);
    return { conversation: result.conversation, assistantMessage: result.assistantMessage };
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
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.chatConversation.updateMany({
        where: { id, userId },
        data: { title },
      });
      if (!updated.count) return null;
      const conversation = await tx.chatConversation.findFirstOrThrow({ where: { id, userId } });
      const change = await recordCoachChange(tx, userId, id, "renamed");
      return { conversation, change };
    });
    if (!result) return null;
    publishCoachChange(result.change);
    return result.conversation;
  },

  /** Sets or clears a persistent pin, owner-scoped at mutation time. */
  async setConversationPinned(
    id: string,
    userId: string,
    pinned: boolean,
  ): Promise<ChatConversation | null> {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.chatConversation.updateMany({
        where: { id, userId },
        data: { pinnedAt: pinned ? new Date() : null },
      });
      if (!updated.count) return null;
      const conversation = await tx.chatConversation.findFirstOrThrow({ where: { id, userId } });
      const change = await recordCoachChange(tx, userId, id, "pinned");
      return { conversation, change };
    });
    if (!result) return null;
    publishCoachChange(result.change);
    return result.conversation;
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
    const result = await prisma.$transaction(async (tx) => {
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
      const conversation = await tx.chatConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date(), ...(title ? { title } : {}) },
      });
      const change = await recordCoachChange(tx, conversation.userId, conversationId, "turn");
      return { assistantMessage, change };
    });
    publishCoachChange(result.change);
    return result.assistantMessage;
  },

  /** Deletes a conversation (and its messages via cascade), owner-scoped. */
  async deleteConversation(id: string, userId: string): Promise<boolean> {
    const change = await prisma.$transaction(async (tx) => {
      const result = await tx.chatConversation.deleteMany({ where: { id, userId } });
      return result.count ? recordCoachChange(tx, userId, id, "deleted") : null;
    });
    if (change) publishCoachChange(change);
    return !!change;
  },
};
