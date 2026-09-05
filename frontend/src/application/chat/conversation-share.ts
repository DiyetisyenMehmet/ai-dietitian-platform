import type { ChatMessage, Conversation } from "@/domain/chat/types";
import { apiRequest } from "@/infrastructure/api/http-client";

interface ApiChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

interface ApiConversationDetail {
  id: string;
  title: string | null;
  pinnedAt: string | null;
  updatedAt: string;
  messages: ApiChatMessage[];
}

interface GetConversationResponse {
  conversation: ApiConversationDetail;
}

function toEpoch(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function toOptionalEpoch(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMessage(message: ApiChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role === "ASSISTANT" ? "assistant" : "user",
    content: message.content,
    createdAt: toEpoch(message.createdAt),
  };
}

/** Loads the complete owner-scoped conversation without changing active chat state. */
export async function loadConversationForShare(id: string): Promise<Conversation> {
  const result = await apiRequest<GetConversationResponse>({
    path: `/ai-chat/conversations/${encodeURIComponent(id)}`,
    method: "GET",
    auth: true,
  });

  return {
    id: result.conversation.id,
    title: result.conversation.title?.trim() || "Sohbet",
    messages: result.conversation.messages.map(mapMessage),
    updatedAt: toEpoch(result.conversation.updatedAt),
    pinnedAt: toOptionalEpoch(result.conversation.pinnedAt),
  };
}

/** Produces a portable plain-text transcript; no internal provider metadata is exposed. */
export function formatConversationForShare(conversation: Conversation): string {
  const transcript = conversation.messages
    .map((message) => {
      const speaker = message.role === "user" ? "Sen" : "Diewish AI Koç";
      return `${speaker}:\n${message.content.trim()}`;
    })
    .join("\n\n");

  return `Diewish AI Koç — ${conversation.title}\n\n${transcript}`.trim();
}
