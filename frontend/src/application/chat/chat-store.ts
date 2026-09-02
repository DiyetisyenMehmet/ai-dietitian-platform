"use client";

import * as React from "react";

import type { ChatMessage, Conversation, MessageReaction } from "@/domain/chat/types";
import { dailyTrackingStore } from "@/application/health/daily-tracking-store";
import { apiRequest, ApiError } from "@/infrastructure/api/http-client";

/**
 * Backend-backed AI chat store.
 *
 * Conversations and messages are persisted by the Diewish backend/Neon rather
 * than being generated from client-side canned responses. A local draft thread
 * exists only until the first message creates the real backend conversation.
 */

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${uid++}`;
const DRAFT_PREFIX = "draft-";

interface ChatState {
  conversations: Conversation[];
  activeId: string;
  /** True while the backend is generating an assistant reply. */
  isResponding: boolean;
  /** True while conversation history is being fetched. */
  isLoading: boolean;
  /** Last transport/backend error, when present. */
  error: string | null;
}

interface ApiConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

interface ApiConversationDetail extends ApiConversationSummary {
  messages: ApiChatMessage[];
}

interface ListConversationsResponse {
  conversations: ApiConversationSummary[];
}

interface GetConversationResponse {
  conversation: ApiConversationDetail;
}

interface SendMessageResponse {
  conversationId: string;
  message: ApiChatMessage;
}

function createEmptyConversation(): Conversation {
  return {
    id: `${DRAFT_PREFIX}${nextId("conv")}`,
    title: "Yeni sohbet",
    messages: [],
    updatedAt: Date.now(),
  };
}

function toEpoch(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function mapMessage(message: ApiChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role === "ASSISTANT" ? "assistant" : "user",
    content: message.content,
    createdAt: toEpoch(message.createdAt),
  };
}

function mapSummary(conversation: ApiConversationSummary): Conversation {
  return {
    id: conversation.id,
    title: conversation.title?.trim() || "Sohbet",
    messages: [],
    updatedAt: toEpoch(conversation.updatedAt),
  };
}

function mapDetail(conversation: ApiConversationDetail): Conversation {
  return {
    ...mapSummary(conversation),
    messages: conversation.messages.map(mapMessage),
  };
}

function deriveTitle(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 32 ? `${trimmed.slice(0, 32)}…` : trimmed || "Yeni sohbet";
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "SUBSCRIPTION_REQUIRED") {
      return "Ücretsiz AI Koç kullanım hakkın doldu. Devam etmek için plan seçeneklerini inceleyebilirsin.";
    }
    if (error.status === 401) {
      return "Oturumunun süresi dolmuş olabilir. Lütfen yeniden giriş yap.";
    }
    if (error.status === 429) {
      return "AI Koç kullanım limitine ulaştın. Bir süre sonra tekrar deneyebilir veya planını inceleyebilirsin.";
    }
    return error.message;
  }
  return "AI Koç şu anda yanıt veremiyor. Lütfen biraz sonra tekrar dene.";
}

const initialConversation = createEmptyConversation();

let state: ChatState = {
  conversations: [initialConversation],
  activeId: initialConversation.id,
  isResponding: false,
  isLoading: false,
  error: null,
};

const listeners = new Set<() => void>();
const loadedConversationIds = new Set<string>();
let initialized = false;
let initializePromise: Promise<void> | null = null;

function setState(next: Partial<ChatState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function updateConversation(id: string, mutator: (conv: Conversation) => Conversation) {
  setState({
    conversations: state.conversations.map((conversation) =>
      conversation.id === id ? mutator(conversation) : conversation,
    ),
  });
}

async function fetchConversation(id: string): Promise<Conversation> {
  const result = await apiRequest<GetConversationResponse>({
    path: `/ai-chat/conversations/${encodeURIComponent(id)}`,
    method: "GET",
    auth: true,
  });
  loadedConversationIds.add(id);
  return mapDetail(result.conversation);
}

async function initializeFromBackend(): Promise<void> {
  if (initialized) return;
  if (initializePromise) return initializePromise;

  initializePromise = (async () => {
    setState({ isLoading: true, error: null });
    try {
      const result = await apiRequest<ListConversationsResponse>({
        path: "/ai-chat/conversations",
        method: "GET",
        auth: true,
      });

      if (result.conversations.length === 0) {
        const draft = createEmptyConversation();
        setState({ conversations: [draft], activeId: draft.id });
      } else {
        const summaries = result.conversations.map(mapSummary);
        const first = await fetchConversation(summaries[0].id);
        setState({
          conversations: summaries.map((conversation) =>
            conversation.id === first.id ? first : conversation,
          ),
          activeId: first.id,
        });
      }
      initialized = true;
    } catch (error) {
      setState({ error: friendlyError(error) });
    } finally {
      initializePromise = null;
      setState({ isLoading: false });
    }
  })();

  return initializePromise;
}

export const chatStore = {
  initialize(): Promise<void> {
    return initializeFromBackend();
  },

  sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || state.isResponding) return;

    const targetId = state.activeId;
    const active = state.conversations.find((conversation) => conversation.id === targetId);
    if (!active) return;

    const isDraft = targetId.startsWith(DRAFT_PREFIX);
    const userMessage: ChatMessage = {
      id: nextId("user"),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const pendingAssistantId = nextId("assistant");
    const pendingAssistant: ChatMessage = {
      id: pendingAssistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      streaming: true,
    };

    updateConversation(targetId, (conversation) => ({
      ...conversation,
      title: conversation.messages.length === 0 ? deriveTitle(trimmed) : conversation.title,
      updatedAt: Date.now(),
      messages: [...conversation.messages, userMessage, pendingAssistant],
    }));
    setState({ isResponding: true, error: null });

    void (async () => {
      try {
        const result = await apiRequest<SendMessageResponse>({
          path: "/ai-chat/messages",
          method: "POST",
          auth: true,
          body: JSON.stringify({
            message: trimmed,
            ...(isDraft ? {} : { conversationId: targetId }),
          }),
        });

        const assistantMessage = mapMessage(result.message);
        const serverId = result.conversationId;

        if (isDraft) {
          loadedConversationIds.add(serverId);
          const nextConversations = state.conversations.map((conversation) => {
            if (conversation.id !== targetId) return conversation;
            return {
              ...conversation,
              id: serverId,
              title: deriveTitle(trimmed),
              updatedAt: assistantMessage.createdAt,
              messages: conversation.messages.map((message) =>
                message.id === pendingAssistantId ? assistantMessage : message,
              ),
            };
          });
          setState({
            conversations: nextConversations,
            activeId: state.activeId === targetId ? serverId : state.activeId,
          });
        } else {
          loadedConversationIds.add(targetId);
          updateConversation(targetId, (conversation) => ({
            ...conversation,
            updatedAt: assistantMessage.createdAt,
            messages: conversation.messages.map((message) =>
              message.id === pendingAssistantId ? assistantMessage : message,
            ),
          }));
        }

        // Count the daily coach task only after a real backend AI turn succeeds.
        dailyTrackingStore.markChatted();
      } catch (error) {
        const message = friendlyError(error);
        updateConversation(targetId, (conversation) => ({
          ...conversation,
          messages: conversation.messages.map((item) =>
            item.id === pendingAssistantId
              ? { ...item, content: message, streaming: false }
              : item,
          ),
        }));
        setState({ error: message });
      } finally {
        setState({ isResponding: false });
      }
    })();
  },

  /**
   * Regeneration needs a dedicated backend endpoint so it can replace a reply
   * without duplicating persisted user turns. Until that exists we deliberately
   * do not fake or mutate server history.
   */
  regenerate() {
    return;
  },

  setReaction(messageId: string, reaction: MessageReaction) {
    updateConversation(state.activeId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.id === messageId
          ? { ...message, reaction: message.reaction === reaction ? null : reaction }
          : message,
      ),
    }));
  },

  newChat() {
    const active = state.conversations.find((conversation) => conversation.id === state.activeId);
    if (active && active.id.startsWith(DRAFT_PREFIX) && active.messages.length === 0) return;

    const draft = createEmptyConversation();
    setState({
      conversations: [draft, ...state.conversations],
      activeId: draft.id,
      error: null,
    });
  },

  selectConversation(id: string) {
    if (id === state.activeId || state.isResponding) return;
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) return;

    setState({ activeId: id, error: null });
    if (id.startsWith(DRAFT_PREFIX) || loadedConversationIds.has(id)) return;

    setState({ isLoading: true });
    void (async () => {
      try {
        const fullConversation = await fetchConversation(id);
        updateConversation(id, () => fullConversation);
      } catch (error) {
        setState({ error: friendlyError(error) });
      } finally {
        setState({ isLoading: false });
      }
    })();
  },
};

/** Subscribe to the entire chat state and hydrate persisted server history once. */
export function useChatState(): ChatState {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  React.useEffect(() => {
    void chatStore.initialize();
  }, []);

  return snapshot;
}

/** Selector for the active conversation. */
export function useActiveConversation(): Conversation {
  const s = useChatState();
  return s.conversations.find((conversation) => conversation.id === s.activeId) ?? s.conversations[0];
}
