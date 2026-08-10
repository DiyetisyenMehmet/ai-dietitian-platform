import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendNoContent, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { aiChatService } from "./ai-chat.service";
import type { ConversationIdParam, SendMessageInput } from "./dto/ai-chat.schemas";

/** Resolves the authenticated user id or throws 401. */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

/**
 * Controller for Diewish's AI Dietitian Chat. The turn runs synchronously (no
 * job queue in this codebase), so the assistant reply is returned on completion
 * along with the caller's refreshed AI usage quota.
 */
export const aiChatController = {
  /** Sends a message and returns the assistant reply. */
  sendMessage: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { conversationId, message } = req.body as SendMessageInput;
    const result = await aiChatService.sendMessage(userId, message, conversationId);
    sendCreated(res, result);
  }),

  /** Lists the authenticated user's conversations. */
  listConversations: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const conversations = await aiChatService.listConversations(userId);
    sendSuccess(res, { conversations });
  }),

  /** Returns a conversation with its full message history. */
  getConversation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ConversationIdParam;
    const conversation = await aiChatService.getConversation(userId, id);
    sendSuccess(res, { conversation });
  }),

  /** Deletes a conversation and its messages. */
  deleteConversation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as ConversationIdParam;
    await aiChatService.deleteConversation(userId, id);
    sendNoContent(res);
  }),
};
