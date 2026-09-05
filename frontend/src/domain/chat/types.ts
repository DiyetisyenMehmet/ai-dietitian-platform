import type { LucideIcon } from "lucide-react";

/** Author of a chat message. */
export type ChatRole = "user" | "assistant";

/** Thumbs reaction on an assistant message. */
export type MessageReaction = "up" | "down" | null;

/** A single chat message. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Markdown content for assistant messages; plain text for user messages. */
  content: string;
  /** Epoch milliseconds the message was created. */
  createdAt: number;
  /** Assistant-only: whether content is still "streaming" in. */
  streaming?: boolean;
  /** Assistant-only: reader reaction. */
  reaction?: MessageReaction;
}

/** A conversation thread shown in the sidebar. */
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  /** Epoch milliseconds of the last update, used for recency ordering. */
  updatedAt: number;
  /** Epoch milliseconds when pinned; null means the conversation is not pinned. */
  pinnedAt: number | null;
}

/** A tappable prompt suggestion shown on the welcome screen. */
export interface SuggestionCard {
  id: string;
  label: string;
  prompt: string;
  icon: LucideIcon;
}
