import type { ChatConversation, ChatMessage } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { getAIAdapter } from "../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { bloodTestAnalysisRepository } from "../blood-test-analysis/blood-test-analysis.repository";
import { aiUsageService } from "../ai-usage/ai-usage.service";
import type { FeatureQuotaStatus } from "../ai-usage/types";
import { aiMemoryService } from "../ai-coach/ai-memory.service";
import { isUserPremium } from "../ai-coach/premium";
import { smartQuestionEngine } from "../ai-coach/smart-question.engine";
import { aiChatRepository, type ConversationWithMessages } from "./ai-chat.repository";
import { CHAT_HISTORY_LIMIT, TITLE_MAX_LENGTH } from "./constants";
import { buildMinimizedContext, redactPii } from "./phi/phi-minimizer";
import type { ChatHistoryTurn } from "./types";

/** The AI feature key this module consumes quota under. */
const FEATURE = "DIETITIAN_CHAT" as const;

/** Result of sending a message: the assistant reply plus fresh quota status. */
export interface SendMessageResult {
  conversationId: string;
  message: ChatMessage;
  quota: FeatureQuotaStatus;
}

/** Derives a short conversation title from the first user message. */
function deriveTitle(message: string): string {
  const collapsed = message.replace(/\s+/g, " ").trim();
  return collapsed.length > TITLE_MAX_LENGTH
    ? `${collapsed.slice(0, TITLE_MAX_LENGTH - 1)}…`
    : collapsed;
}

/**
 * AI Dietitian Chat orchestrator (Sprint 14, C2).
 *
 * Pipeline for each turn: resolve ownership → enforce AI usage quota → assemble
 * PHI-minimized context → replay bounded/redacted history → call the provider →
 * persist the completed turn atomically → record usage. For a brand-new thread,
 * the conversation row is created only together with the successful first turn,
 * so quota/provider failures never leave empty conversations behind.
 */
export const aiChatService = {
  /**
   * Sends a user message and returns the assistant reply.
   *
   * @param userId - Authenticated owner id.
   * @param message - The user's original message text.
   * @param conversationId - Existing conversation to continue, or undefined to
   *                          start a new one.
   * @throws {ApiError} 404 when a given conversation is not found/owned.
   * @throws {ApiError} 403 when the FREE lifetime trial is exhausted.
   * @throws {ApiError} 429 when a paid-tier rolling quota is exhausted.
   */
  async sendMessage(
    userId: string,
    message: string,
    conversationId?: string,
  ): Promise<SendMessageResult> {
    // 1. Resolve an existing conversation up front for ownership checks. A new
    // conversation is intentionally NOT created yet; that happens atomically
    // with the first successful turn after the provider returns.
    let conversation: ChatConversation | null = null;
    if (conversationId) {
      conversation = await aiChatRepository.findConversation(conversationId, userId);
      if (!conversation) {
        throw ApiError.notFound("Conversation not found.");
      }
    }

    // 2. Enforce quota BEFORE any external AI call or new conversation write.
    await aiUsageService.assertWithinQuota(userId, FEATURE);

    try {
      // 3. Assemble a non-identifying context (AD-039 PHI minimization).
      const [profile, activePlan, analyses] = await Promise.all([
        prisma.userProfile.findUnique({ where: { userId } }),
        prisma.nutritionPlan.findFirst({
          where: { userId, isActive: true },
          orderBy: { updatedAt: "desc" },
        }),
        bloodTestAnalysisRepository.listByUser(userId),
      ]);
      const latestAnalysis = analyses.find((a) => a.status === "COMPLETED") ?? null;
      const context = buildMinimizedContext({ profile, activePlan, latestAnalysis });

      // Sprint 19: resolve premium status once, then inject AI Long-Term Memory
      // context. Memory depth and reply length scale with the caller's tier.
      const premium = await isUserPremium(userId);
      const memory = await aiMemoryService.buildMemoryContext(userId, premium);
      if (memory) {
        context.memory = memory;
      }

      // 4. Bounded, PHI-redacted history (no history for a brand-new thread).
      const priorMessages = conversation
        ? await aiChatRepository.getRecentMessages(conversation.id, CHAT_HISTORY_LIMIT)
        : [];
      const history: ChatHistoryTurn[] = priorMessages.map((m) => ({
        role: m.role === "ASSISTANT" ? "assistant" : "user",
        content: redactPii(m.content),
      }));

      // 5. Call the provider-agnostic adapter with a redacted copy of the user's
      // message. The original text is kept only for Diewish's own persisted turn.
      const adapter = getAIAdapter();
      const output = await adapter.chatWithDietitian({
        context,
        history,
        message: redactPii(message),
        premium,
      });

      // Sprint 19, Section 3: if the user's progress has declined, prepend a
      // structured investigative question block BEFORE the advice.
      let reply = output.reply;
      try {
        const decline = await smartQuestionEngine.detectProgressDecline(userId);
        if (decline.declined) {
          reply = `${smartQuestionEngine.renderQuestionBlock(decline)}\n\n${reply}`;
        }
      } catch (error) {
        logger.warn({ err: error, userId }, "Smart question block generation skipped");
      }

      const assistantData = {
        content: reply,
        provider: adapter.info.provider,
        model: adapter.info.model,
      };

      // 6. Persist the completed turn. New conversations are created together
      // with their first two messages in one transaction; existing conversations
      // append both messages atomically and touch updatedAt.
      let persistedConversationId: string;
      let assistantMessage: ChatMessage;

      if (conversation) {
        persistedConversationId = conversation.id;
        assistantMessage = await aiChatRepository.appendTurn(
          conversation.id,
          message,
          assistantData,
          conversation.title ?? deriveTitle(message),
        );
      } else {
        const created = await aiChatRepository.createConversationWithTurn(
          userId,
          deriveTitle(message),
          message,
          assistantData,
        );
        conversation = created.conversation;
        persistedConversationId = created.conversation.id;
        assistantMessage = created.assistantMessage;
      }

      // 7. Record successful external-AI usage, then return a fresh quota snapshot.
      await aiUsageService.record({
        userId,
        feature: FEATURE,
        provider: adapter.info.provider,
        model: adapter.info.model,
      });
      const quota = await aiUsageService.getStatus(userId, FEATURE);

      return { conversationId: persistedConversationId, message: assistantMessage, quota };
    } catch (error) {
      logger.error(
        { err: error, userId, conversationId: conversation?.id ?? conversationId ?? null },
        "AI chat turn failed",
      );
      if (error instanceof ApiError) throw error;
      throw ApiError.internal("The AI dietitian chat is temporarily unavailable.");
    }
  },

  /** Lists the user's conversations (most recently updated first). */
  listConversations(userId: string): Promise<ChatConversation[]> {
    return aiChatRepository.listConversations(userId);
  },

  /**
   * Returns a conversation with its full message history.
   *
   * @throws {ApiError} 404 when not found / not owned.
   */
  async getConversation(userId: string, id: string): Promise<ConversationWithMessages> {
    const conversation = await aiChatRepository.findConversationWithMessages(id, userId);
    if (!conversation) {
      throw ApiError.notFound("Conversation not found.");
    }
    return conversation;
  },

  /**
   * Deletes a conversation and its messages.
   *
   * @throws {ApiError} 404 when not found / not owned.
   */
  async deleteConversation(userId: string, id: string): Promise<void> {
    const deleted = await aiChatRepository.deleteConversation(id, userId);
    if (!deleted) {
      throw ApiError.notFound("Conversation not found.");
    }
  },
};
