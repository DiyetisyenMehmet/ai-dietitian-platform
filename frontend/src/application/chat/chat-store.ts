"use client";

import * as React from "react";

import type { ChatMessage, Conversation, MessageReaction } from "@/domain/chat/types";
import { dailyTrackingStore } from "@/application/health/daily-tracking-store";
import { apiRequest, ApiError } from "@/infrastructure/api/http-client";

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${uid++}`;
const DRAFT_PREFIX = "draft-";

export function isDraftConversationId(id: string): boolean {
  return id.startsWith(DRAFT_PREFIX);
}

interface ChatState {
  conversations: Conversation[];
  activeId: string;
  isResponding: boolean;
  isLoading: boolean;
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

interface RenameConversationResponse {
  conversation: ApiConversationSummary;
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

function createInitialState(): ChatState {
  const draft = createEmptyConversation();
  return {
    conversations: [draft],
    activeId: draft.id,
    isResponding: false,
    isLoading: false,
    error: null,
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

function isToday(timestamp: number): boolean {
  const value = new Date(timestamp);
  const now = new Date();
  return (
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate()
  );
}

/** Convert transport/backend failures into user-safe Turkish product messages. */
function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "SUBSCRIPTION_REQUIRED") {
      return "Ücretsiz AI Koç kullanım hakkın doldu. Devam etmek için plan seçeneklerini inceleyebilirsin.";
    }
    if (error.code === "CONSENT_REQUIRED") {
      return "AI Koç'u kullanmak için güncel yasal onaylarını tamamlaman gerekiyor.";
    }
    if (error.status === 401) {
      return "Oturum yenilenemedi. Lütfen yeniden giriş yap.";
    }
    if (error.status === 429) {
      return "AI Koç kullanım limitine ulaştın. Bir süre sonra tekrar deneyebilir veya planını inceleyebilirsin.";
    }
    // Never expose provider names, environment variables, secret configuration,
    // stack details or upstream messages to an end user.
    if (error.status === 0 || error.status >= 500) {
      return "AI Koç şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.";
    }
    return "AI Koç isteği tamamlanamadı. Lütfen tekrar dene.";
  }
  return "AI Koç şu anda yanıt veremiyor. Lütfen biraz sonra tekrar dene.";
}

let state: ChatState = createInitialState();
const listeners = new Set<() => void>();
const loadedConversationIds = new Set<string>();
let initialized = false;
let initializePromise: Promise<void> | null = null;
let sessionGeneration = 0;

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

function removeConversationLocally(id: string) {
  loadedConversationIds.delete(id);
  const remaining = state.conversations.filter((conversation) => conversation.id !== id);

  if (remaining.length === 0) {
    const draft = createEmptyConversation();
    setState({ conversations: [draft], activeId: draft.id, error: null });
    return;
  }

  if (state.activeId === id) {
    const existingDraft = remaining.find(
      (conversation) => isDraftConversationId(conversation.id) && conversation.messages.length === 0,
    );
    const draft = existingDraft ?? createEmptyConversation();
    setState({
      conversations: existingDraft ? remaining : [draft, ...remaining],
      activeId: draft.id,
      error: null,
    });
    return;
  }

  setState({ conversations: remaining, error: null });
}

async function fetchConversation(id: string): Promise<Conversation> {
  const result = await apiRequest<GetConversationResponse>({
    path: `/ai-chat/conversations/${encodeURIComponent(id)}`,
    method: "GET",
    auth: true,
  });
  return mapDetail(result.conversation);
}

async function initializeFromBackend(): Promise<void> {
  if (initialized) return;
  if (initializePromise) return initializePromise;

  const generation = sessionGeneration;
  initializePromise = (async () => {
    if (generation !== sessionGeneration) return;
    setState({ isLoading: true, error: null });
    try {
      const result = await apiRequest<ListConversationsResponse>({
        path: "/ai-chat/conversations",
        method: "GET",
        auth: true,
      });
      if (generation !== sessionGeneration) return;

      if (result.conversations.length === 0) {
        const draft = createEmptyConversation();
        setState({ conversations: [draft], activeId: draft.id });
      } else {
        const summaries = result.conversations.map(mapSummary);
        const first = await fetchConversation(summaries[0].id);
        if (generation !== sessionGeneration) return;
        loadedConversationIds.add(first.id);
        setState({
          conversations: summaries.map((conversation) =>
            conversation.id === first.id ? first : conversation,
          ),
          activeId: first.id,
        });

        if (first.messages.some((message) => message.role === "user" && isToday(message.createdAt))) {
          dailyTrackingStore.markChatted();
        }
      }
      if (generation === sessionGeneration) initialized = true;
    } catch (error) {
      if (generation === sessionGeneration) setState({ error: friendlyError(error) });
    } finally {
      if (generation === sessionGeneration) {
        initializePromise = null;
        setState({ isLoading: false });
      }
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

    const generation = sessionGeneration;
    const targetId = state.activeId;
    const active = state.conversations.find((conversation) => conversation.id === targetId);
    if (!active) return;

    const isDraft = isDraftConversationId(targetId);
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
        if (generation !== sessionGeneration) return;

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

        dailyTrackingStore.markChatted();
      } catch (error) {
        if (generation !== sessionGeneration) return;
        const message = friendlyError(error);
        updateConversation(targetId, (conversation) => ({
          ...conversation,
          messages: conversation.messages.map((item) =>
            item.id === pendingAssistantId
              ? { ...item, content: message, streaming: false }
              : item,
          ),
        }));
        // The failed assistant bubble already communicates this request's error.
        // Avoid duplicating the same message in the global chat warning banner.
        setState({ error: null });
      } finally {
        if (generation === sessionGeneration) setState({ isResponding: false });
      }
    })();
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

  async renameConversation(id: string, title: string): Promise<boolean> {
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > 80 || state.isResponding || isDraftConversationId(id)) {
      return false;
    }
    if (!state.conversations.some((conversation) => conversation.id === id)) return false;

    const generation = sessionGeneration;
    try {
      const result = await apiRequest<RenameConversationResponse>({
        path: `/ai-chat/conversations/${encodeURIComponent(id)}`,
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ title: trimmed }),
      });
      if (generation !== sessionGeneration) return false;

      updateConversation(id, (conversation) => ({
        ...conversation,
        title: result.conversation.title?.trim() || trimmed,
      }));
      setState({ error: null });
      return true;
    } catch (error) {
      if (generation !== sessionGeneration) return false;
      setState({
        error:
          error instanceof ApiError && error.status === 401
            ? "Oturum yenilenemedi. Lütfen yeniden giriş yap."
            : "Sohbet adı değiştirilemedi. Lütfen tekrar dene.",
      });
      return false;
    }
  },

  async deleteConversation(id: string): Promise<boolean> {
    if (state.isResponding || isDraftConversationId(id)) return false;
    if (!state.conversations.some((conversation) => conversation.id === id)) return false;

    const generation = sessionGeneration;
    try {
      await apiRequest<void>({
        path: `/ai-chat/conversations/${encodeURIComponent(id)}`,
        method: "DELETE",
        auth: true,
      });
      if (generation !== sessionGeneration) return false;

      removeConversationLocally(id);
      return true;
    } catch (error) {
      if (generation !== sessionGeneration) return false;

      // A stale local row may already have been removed on another device. In
      // that case the desired end state is already true, so reconcile locally.
      if (error instanceof ApiError && error.status === 404) {
        removeConversationLocally(id);
        return true;
      }

      setState({
        error:
          error instanceof ApiError && error.status === 401
            ? "Oturum yenilenemedi. Lütfen yeniden giriş yap."
            : "Sohbet silinemedi. Lütfen tekrar dene.",
      });
      return false;
    }
  },

  newChat() {
    const active = state.conversations.find((conversation) => conversation.id === state.activeId);
    if (active && isDraftConversationId(active.id) && active.messages.length === 0) return;

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
    if (isDraftConversationId(id) || loadedConversationIds.has(id)) return;

    const generation = sessionGeneration;
    setState({ isLoading: true });
    void (async () => {
      try {
        const fullConversation = await fetchConversation(id);
        if (generation !== sessionGeneration) return;
        loadedConversationIds.add(id);
        updateConversation(id, () => fullConversation);
      } catch (error) {
        if (generation === sessionGeneration) setState({ error: friendlyError(error) });
      } finally {
        if (generation === sessionGeneration) setState({ isLoading: false });
      }
    })();
  },

  resetSession() {
    sessionGeneration += 1;
    initialized = false;
    initializePromise = null;
    loadedConversationIds.clear();
    state = createInitialState();
    listeners.forEach((listener) => listener());
  },
};

export function useChatState(): ChatState {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  React.useEffect(() => {
    void chatStore.initialize();
  }, []);

  return snapshot;
}

export function useActiveConversation(): Conversation {
  const snapshot = useChatState();
  return (
    snapshot.conversations.find((conversation) => conversation.id === snapshot.activeId) ??
    snapshot.conversations[0]
  );
}
