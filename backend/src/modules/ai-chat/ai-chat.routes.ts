import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { aiChatController } from "./ai-chat.controller";
import { conversationIdParamSchema, sendMessageSchema } from "./dto/ai-chat.schemas";

/**
 * AI Dietitian Chat router (mounted at /api/ai-chat). Every route requires a
 * valid access token; the service scopes all access by owner. Concrete paths
 * are declared before the parameterized `/conversations/:id` route.
 */
export const aiChatRouter = Router();

/**
 * @openapi
 * /api/ai-chat/messages:
 *   post:
 *     tags: [AiChat]
 *     summary: Send a message to the AI dietitian
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               conversationId: { type: string, format: uuid }
 *               message: { type: string, maxLength: 4000 }
 *     responses:
 *       201: { description: The assistant reply and refreshed usage quota. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: Conversation not found. }
 *       429: { description: AI usage quota exceeded for the caller's plan. }
 */
aiChatRouter.post(
  "/messages",
  authenticate,
  validate({ body: sendMessageSchema }),
  aiChatController.sendMessage,
);

/**
 * @openapi
 * /api/ai-chat/conversations:
 *   get:
 *     tags: [AiChat]
 *     summary: List the caller's conversations
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Conversations, most recently updated first. }
 *       401: { description: Missing or invalid access token. }
 */
aiChatRouter.get("/conversations", authenticate, aiChatController.listConversations);

/**
 * @openapi
 * /api/ai-chat/conversations/{id}:
 *   get:
 *     tags: [AiChat]
 *     summary: Get a conversation with its messages
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The conversation and its ordered messages. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: Conversation not found. }
 *   delete:
 *     tags: [AiChat]
 *     summary: Delete a conversation
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: Conversation not found. }
 */
aiChatRouter.get(
  "/conversations/:id",
  authenticate,
  validate({ params: conversationIdParamSchema }),
  aiChatController.getConversation,
);

aiChatRouter.delete(
  "/conversations/:id",
  authenticate,
  validate({ params: conversationIdParamSchema }),
  aiChatController.deleteConversation,
);
