"use client";

import * as React from "react";

import type { ChatMessage, Conversation, MessageReaction } from "@/domain/chat/types";
import { getPlaceholderResponse } from "./placeholder-responses";

/**
 * In-memory chat store shared across the app via useSyncExternalStore.
 *
 * Simulates an AI assistant entirely on the client: canned markdown answers
 * are "streamed" in word-by-word. No AI model, backend, RAG or memory is
 * involved — this is placeholder UX logic only. State lives for the browser
 * session.
 */

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${uid++}`;

interface ChatState {
  conversations: Conversation[];
  activeId: string;
  /** True while an assistant reply is being generated/streamed. */
  isResponding: boolean;
}

function seedConversations(): Conversation[] {
  const now = Date.now();
  return [
    {
      id: "conv-history-1",
      title: "Haftalık öğün planı",
      updatedAt: now - 1000 * 60 * 60 * 24,
      messages: [
        {
          id: "h1-u",
          role: "user",
          content: "Haftalık bir öğün planı yapar mısın?",
          createdAt: now - 1000 * 60 * 60 * 24,
        },
        {
          id: "h1-a",
          role: "assistant",
          content: getPlaceholderResponse("öğün planı"),
          createdAt: now - 1000 * 60 * 60 * 24 + 2000,
        },
      ],
    },
    {
      id: "conv-history-2",
      title: "Yüksek proteinli besinler",
      updatedAt: now - 1000 * 60 * 60 * 48,
      messages: [
        {
          id: "h2-u",
          role: "user",
          content: "Yüksek proteinli besinler nelerdir?",
          createdAt: now - 1000 * 60 * 60 * 48,
        },
        {
          id: "h2-a",
          role: "assistant",
          content: getPlaceholderResponse("protein"),
          createdAt: now - 1000 * 60 * 60 * 48 + 2000,
        },
      ],
    },
  ];
}

function createEmptyConversation(): Conversation {
  return { id: nextId("conv"), title: "Yeni sohbet", messages: [], updatedAt: Date.now() };
}

const initialConversation = createEmptyConversation();

let state: ChatState = {
  conversations: [initialConversation, ...seedConversations()],
  activeId: initialConversation.id,
  isResponding: false,
};

const listeners = new Set<() => void>();
let streamTimer: ReturnType<typeof setInterval> | null = null;

function setState(next: Partial<ChatState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function updateActive(mutator: (conv: Conversation) => Conversation) {
  setState({
    conversations: state.conversations.map((c) => (c.id === state.activeId ? mutator(c) : c)),
  });
}

function deriveTitle(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 32 ? `${trimmed.slice(0, 32)}…` : trimmed || "Yeni sohbet";
}

/** Streams the given full text into the assistant message word by word. */
function streamAssistant(messageId: string, fullText: string) {
  const words = fullText.split(" ");
  let index = 0;
  setState({ isResponding: true });

  if (streamTimer) clearInterval(streamTimer);
  streamTimer = setInterval(() => {
    index += Math.max(1, Math.round(words.length / 40)); // ~40 ticks total
    const partial = words.slice(0, index).join(" ");
    const done = index >= words.length;

    updateActive((conv) => ({
      ...conv,
      updatedAt: Date.now(),
      messages: conv.messages.map((m) =>
        m.id === messageId ? { ...m, content: done ? fullText : partial, streaming: !done } : m,
      ),
    }));

    if (done && streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
      setState({ isResponding: false });
    }
  }, 45);
}

export const chatStore = {
  sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || state.isResponding) return;

    const userMessage: ChatMessage = {
      id: nextId("msg"),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const assistantId = nextId("msg");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      streaming: true,
    };

    updateActive((conv) => ({
      ...conv,
      title: conv.messages.length === 0 ? deriveTitle(trimmed) : conv.title,
      updatedAt: Date.now(),
      messages: [...conv.messages, userMessage, assistantMessage],
    }));

    // Simulate "thinking" latency before streaming begins.
    setState({ isResponding: true });
    window.setTimeout(() => streamAssistant(assistantId, getPlaceholderResponse(trimmed)), 700);
  },

  regenerate() {
    if (state.isResponding) return;
    const conv = state.conversations.find((c) => c.id === state.activeId);
    if (!conv) return;
    const lastUser = [...conv.messages].reverse().find((m) => m.role === "user");
    const lastAssistant = [...conv.messages].reverse().find((m) => m.role === "assistant");
    if (!lastUser || !lastAssistant) return;

    updateActive((c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.id === lastAssistant.id ? { ...m, content: "", streaming: true, reaction: null } : m,
      ),
    }));
    setState({ isResponding: true });
    window.setTimeout(
      () => streamAssistant(lastAssistant.id, getPlaceholderResponse(lastUser.content)),
      500,
    );
  },

  setReaction(messageId: string, reaction: MessageReaction) {
    updateActive((conv) => ({
      ...conv,
      messages: conv.messages.map((m) =>
        m.id === messageId ? { ...m, reaction: m.reaction === reaction ? null : reaction } : m,
      ),
    }));
  },

  newChat() {
    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
    // Reuse an existing empty conversation if the active one is already empty.
    const active = state.conversations.find((c) => c.id === state.activeId);
    if (active && active.messages.length === 0) return;

    const conv = createEmptyConversation();
    setState({
      conversations: [conv, ...state.conversations],
      activeId: conv.id,
      isResponding: false,
    });
  },

  selectConversation(id: string) {
    if (id === state.activeId) return;
    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
    setState({ activeId: id, isResponding: false });
  },
};

/** Subscribe to the entire chat state. */
export function useChatState(): ChatState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Selector for the active conversation. */
export function useActiveConversation(): Conversation {
  const s = useChatState();
  return s.conversations.find((c) => c.id === s.activeId) ?? s.conversations[0];
}
