"use client";

import * as React from "react";
import { Plus, MessageSquare, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/presentation/components/ui/button";
import { useChatState, chatStore } from "@/application/chat/chat-store";

interface ChatSidebarProps {
  /** Mobile drawer open state (ignored on desktop where it is always visible). */
  open: boolean;
  onClose: () => void;
}

function relativeDay(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  return `${days} gün önce`;
}

/** Conversation list: New Chat + previous conversations (placeholder history). */
export function ChatSidebar({ open, onClose }: ChatSidebarProps) {
  const { conversations, activeId } = useChatState();
  const ordered = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const panel = (
    <div className="flex h-full w-full flex-col gap-3 p-3">
      <Button
        className="w-full justify-start"
        onClick={() => {
          chatStore.newChat();
          onClose();
        }}
      >
        <Plus aria-hidden="true" />
        Yeni Sohbet
      </Button>

      <p className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Önceki Sohbetler
      </p>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {ordered.map((conv) => {
          const active = conv.id === activeId;
          return (
            <button
              key={conv.id}
              type="button"
              onClick={() => {
                chatStore.selectConversation(conv.id);
                onClose();
              }}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              <MessageSquare
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{conv.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {conv.messages.length > 0 ? relativeDay(conv.updatedAt) : "Boş"}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop: static column */}
      <aside className="hidden w-72 shrink-0 border-r border-border bg-card/40 lg:block">
        {panel}
      </aside>

      {/* Mobile/tablet: slide-over drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-label="Sohbet geçmişi"
          className={cn(
            "absolute inset-y-0 left-0 w-72 max-w-[80%] border-r border-border bg-card shadow-card-hover transition-transform duration-300",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-sm font-semibold">Sohbetler</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          {panel}
        </div>
      </div>
    </>
  );
}
