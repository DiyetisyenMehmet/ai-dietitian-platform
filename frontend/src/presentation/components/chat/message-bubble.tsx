"use client";

import * as React from "react";
import { Copy, Check, Share2, ThumbsUp, ThumbsDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import type { ChatMessage } from "@/domain/chat/types";
import { chatStore } from "@/application/chat/chat-store";
import { MarkdownContent } from "./markdown-content";
import { TypingIndicator } from "./typing-indicator";
import { AiAvatar } from "./ai-avatar";

interface MessageBubbleProps {
  message: ChatMessage;
  /** Whether this is the last assistant message (enables Regenerate). */
  isLastAssistant?: boolean;
  /** Disable actions while a response is generating. */
  busy?: boolean;
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(ts);
}

/** A single chat message row: user (right) or assistant (left) with actions. */
export const MessageBubble = React.memo(function MessageBubble({
  message,
  isLastAssistant = false,
  busy = false,
}: MessageBubbleProps) {
  const [copied, setCopied] = React.useState(false);
  const isUser = message.role === "user";
  const showActions = !isUser && !message.streaming && message.content.length > 0;

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success("Mesaj kopyalandı");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Kopyalama başarısız oldu");
    }
  }, [message.content]);

  const handleShare = React.useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: message.content });
      } else {
        await navigator.clipboard.writeText(message.content);
        toast.success("Paylaşım desteklenmiyor, mesaj kopyalandı");
      }
    } catch {
      /* user cancelled share — no-op */
    }
  }, [message.content]);

  return (
    <div className={cn("flex animate-fade-in gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && <AiAvatar active={message.streaming} className="mt-0.5" />}

      <div className={cn("flex max-w-[85%] flex-col gap-1", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 shadow-card",
            isUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md border border-border bg-card",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          ) : message.streaming && message.content.length === 0 ? (
            <TypingIndicator />
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>

        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</span>

          {showActions && (
            <div className="flex items-center gap-0.5">
              <ActionButton label="Kopyala" onClick={handleCopy}>
                {copied ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </ActionButton>
              <ActionButton label="Paylaş" onClick={handleShare}>
                <Share2 className="size-3.5" />
              </ActionButton>
              <ActionButton
                label="Beğen"
                active={message.reaction === "up"}
                onClick={() => chatStore.setReaction(message.id, "up")}
              >
                <ThumbsUp className="size-3.5" />
              </ActionButton>
              <ActionButton
                label="Beğenme"
                active={message.reaction === "down"}
                onClick={() => chatStore.setReaction(message.id, "down")}
              >
                <ThumbsDown className="size-3.5" />
              </ActionButton>
              {isLastAssistant && (
                <ActionButton
                  label="Yeniden oluştur"
                  onClick={() => chatStore.regenerate()}
                  disabled={busy}
                >
                  <RefreshCw className="size-3.5" />
                </ActionButton>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function ActionButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent text-primary",
      )}
    >
      {children}
    </button>
  );
}
