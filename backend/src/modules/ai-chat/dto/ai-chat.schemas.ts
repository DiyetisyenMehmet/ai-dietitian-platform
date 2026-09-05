import { z } from "zod";

import { MAX_MESSAGE_LENGTH, TITLE_MAX_LENGTH } from "../constants";

/**
 * Validation schemas for the AI Dietitian Chat endpoints (Sprint 14, C2).
 */

/** Body for sending a chat message. A new thread starts when no id is given. */
export const sendMessageSchema = z.object({
  /** Target conversation; omit to start a new conversation. */
  conversationId: z.string().uuid().optional(),
  /** The user's message. */
  message: z
    .string()
    .trim()
    .min(1, "Message must not be empty.")
    .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters.`),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Body for renaming a persisted conversation. */
export const renameConversationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title must not be empty.")
    .max(TITLE_MAX_LENGTH, `Title must be at most ${TITLE_MAX_LENGTH} characters.`),
});

export type RenameConversationInput = z.infer<typeof renameConversationSchema>;

/** Path param carrying a conversation id. */
export const conversationIdParamSchema = z.object({
  id: z.string().uuid("A valid conversation id is required."),
});

export type ConversationIdParam = z.infer<typeof conversationIdParamSchema>;
