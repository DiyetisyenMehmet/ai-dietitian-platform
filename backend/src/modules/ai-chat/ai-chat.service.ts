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
import { trackingRepository } from "../tracking/tracking.repository";
import { aiChatRepository, type ConversationWithMessages } from "./ai-chat.repository";
import { CHAT_HISTORY_LIMIT, DISCLAIMER, TITLE_MAX_LENGTH } from "./constants";
import { buildMinimizedContext, redactPii } from "./phi/phi-minimizer";
import type { ChatHistoryTurn } from "./types";

const FEATURE = "DIETITIAN_CHAT" as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SendMessageResult {
  conversationId: string;
  message: ChatMessage;
  quota: FeatureQuotaStatus;
}

function deriveTitle(message: string): string {
  const collapsed = message.replace(/\s+/g, " ").trim();
  return collapsed.length > TITLE_MAX_LENGTH
    ? `${collapsed.slice(0, TITLE_MAX_LENGTH - 1)}…`
    : collapsed;
}

/**
 * The shared adapter appends a fixed English disclaimer for blood-test and
 * nutrition-plan safety. AI Coach has its own context-aware safety behavior, so
 * do not surface that unrelated English boilerplate at the end of every chat
 * reply. Keep any warning generated as part of the actual answer intact.
 */
function stripFixedChatDisclaimer(reply: string): string {
  const trimmed = reply.trim();
  return trimmed.endsWith(DISCLAIMER)
    ? trimmed.slice(0, -DISCLAIMER.length).trimEnd()
    : trimmed;
}

/**
 * AI Dietitian Chat orchestrator.
 *
 * Each turn is grounded in bounded conversation history, long-term memory and
 * deterministic recent meal/water/weight aggregates. Raw log rows, direct
 * identifiers and raw lab documents are never sent to the external provider.
 */
export const aiChatService = {
  async sendMessage(
    userId: string,
    message: string,
    conversationId?: string,
  ): Promise<SendMessageResult> {
    let conversation: ChatConversation | null = null;
    if (conversationId) {
      conversation = await aiChatRepository.findConversation(conversationId, userId);
      if (!conversation) throw ApiError.notFound("Conversation not found.");
    }

    await aiUsageService.assertWithinQuota(userId, FEATURE);

    try {
      const now = Date.now();
      const last24Hours = new Date(now - DAY_MS);
      const last14Days = new Date(now - 14 * DAY_MS);

      const [profile, activePlan, analyses, recentMeals, recentWater, recentWeights] =
        await Promise.all([
          prisma.userProfile.findUnique({ where: { userId } }),
          prisma.nutritionPlan.findFirst({
            where: { userId, isActive: true },
            orderBy: { updatedAt: "desc" },
          }),
          bloodTestAnalysisRepository.listByUser(userId),
          trackingRepository.listMealLogs(userId, last24Hours),
          trackingRepository.listWaterLogs(userId, last24Hours),
          trackingRepository.listWeightLogs(userId, last14Days),
        ]);

      const latestAnalysis = analyses.find((analysis) => analysis.status === "COMPLETED") ?? null;
      const context = buildMinimizedContext({
        profile,
        activePlan,
        latestAnalysis,
        recentMeals,
        recentWater,
        recentWeights,
      });

      const premium = await isUserPremium(userId);
      const memory = await aiMemoryService.buildMemoryContext(userId, premium);
      if (memory) context.memory = memory;

      const priorMessages = conversation
        ? await aiChatRepository.getRecentMessages(conversation.id, CHAT_HISTORY_LIMIT)
        : [];
      const history: ChatHistoryTurn[] = priorMessages.map((item) => ({
        role: item.role === "ASSISTANT" ? "assistant" : "user",
        content: redactPii(item.content),
      }));

      const adapter = getAIAdapter();
      const output = await adapter.chatWithDietitian({
        context,
        history,
        message: redactPii(message),
        premium,
      });

      let reply = stripFixedChatDisclaimer(output.reply);
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

  listConversations(userId: string): Promise<ChatConversation[]> {
    return aiChatRepository.listConversations(userId);
  },

  async getConversation(userId: string, id: string): Promise<ConversationWithMessages> {
    const conversation = await aiChatRepository.findConversationWithMessages(id, userId);
    if (!conversation) throw ApiError.notFound("Conversation not found.");
    return conversation;
  },

  async deleteConversation(userId: string, id: string): Promise<void> {
    const deleted = await aiChatRepository.deleteConversation(id, userId);
    if (!deleted) throw ApiError.notFound("Conversation not found.");
  },
};
