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
 * Pipeline for each turn: resolve/create conversation → enforce AI usage quota
 * (C5) → assemble a PHI-minimized context from the user's profile, active
 * nutrition plan and latest blood analysis (AD-039) → replay bounded, redacted
 * history → call the provider-agnostic AI adapter → persist the turn (storing
 * the user's ORIGINAL text) → record usage. All AI output is nutrition-only and
 * disclaimer-bound; the adapter enforces the safety guard.
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
   * @throws {ApiError} 429 when the AI usage quota is exhausted.
   */
  async sendMessage(
    userId: string,
    message: string,
    conversationId?: string,
  ): Promise<SendMessageResult> {
    // 1. Resolve or create the conversation (ownership-checked).
    let conversation: ChatConversation | null;
    let isNew = false;
    if (conversationId) {
      conversation = await aiChatRepository.findConversation(conversationId, userId);
      if (!conversation) {
        throw ApiError.notFound("Conversation not found.");
      }
    } else {
      conversation = await aiChatRepository.createConversation(userId, deriveTitle(message));
      isNew = true;
    }

    // 2. Enforce the AI usage quota BEFORE spending on an external call (C5).
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
      // context (Section 1) into the system context. Memory depth and reply
      // length both scale with the caller's tier (Section 8).
      const premium = await isUserPremium(userId);
      const memory = await aiMemoryService.buildMemoryContext(userId, premium);
      if (memory) {
        context.memory = memory;
      }

      // 4. Bounded, PHI-redacted history (exclude the message we are about to send).
      const priorMessages = isNew
        ? []
        : await aiChatRepository.getRecentMessages(conversation.id, CHAT_HISTORY_LIMIT);
      const history: ChatHistoryTurn[] = priorMessages.map((m) => ({
        role: m.role === "ASSISTANT" ? "assistant" : "user",
        content: redactPii(m.content),
      }));

      // 5. Call the provider-agnostic adapter with a redacted message.
      const adapter = getAIAdapter();
      const output = await adapter.chatWithDietitian({
        context,
        history,
        message: redactPii(message),
        premium,
      });

      // Sprint 19, Section 3: if the user's progress has declined, prepend a
      // structured investigative question block BEFORE the advice, and remember
      // that we asked so future turns can adapt.
      let reply = output.reply;
      try {
        const decline = await smartQuestionEngine.detectProgressDecline(userId);
        if (decline.declined) {
          reply = `${smartQuestionEngine.renderQuestionBlock(decline)}\n\n${reply}`;
        }
      } catch (error) {
        logger.warn({ err: error, userId }, "Smart question block generation skipped");
      }

      // 6. Persist the turn (the user's ORIGINAL text is stored, not the redacted copy).
      const assistantMessage = await aiChatRepository.appendTurn(
        conversation.id,
        message,
        { content: reply, provider: adapter.info.provider, model: adapter.info.model },
        isNew ? undefined : (conversation.title ?? deriveTitle(message)),
      );

      // 7. Record usage, then return a fresh quota snapshot.
      await aiUsageService.record({
        userId,
        feature: FEATURE,
        provider: adapter.info.provider,
        model: adapter.info.model,
      });
      const quota = await aiUsageService.getStatus(userId, FEATURE);

      return { conversationId: conversation.id, message: assistantMessage, quota };
    } catch (error) {
      logger.error({ err: error, userId, conversationId: conversation.id }, "AI chat turn failed");
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
