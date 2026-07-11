"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";
import { useActiveConversation, useChatState, chatStore } from "@/application/chat/chat-store";
import { AiAvatar } from "./ai-avatar";
import { ChatSidebar } from "./chat-sidebar";
import { WelcomeScreen } from "./welcome-screen";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { ScrollToBottomButton } from "./scroll-to-bottom";

const USER_NAME = "Mehmet";

/** Full-screen AI chat experience: sidebar + message thread + composer. */
export function ChatView() {
  const conversation = useActiveConversation();
  const { isResponding } = useChatState();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showScrollButton, setShowScrollButton] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const messages = conversation.messages;
  const lastMessage = messages[messages.length - 1];

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const isNearBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Auto-scroll as messages grow / stream, but only if the user is at the bottom.
  React.useEffect(() => {
    if (isNearBottom()) scrollToBottom(messages.length <= 1 ? "auto" : "smooth");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, lastMessage?.content, conversation.id]);

  const handleScroll = React.useCallback(() => {
    setShowScrollButton(!isNearBottom());
  }, [isNearBottom]);

  const isEmpty = messages.length === 0;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Sohbet geçmişi"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <div className="flex flex-1 items-center gap-2">
          <AiAvatar />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Beslenme Koçun</p>
            <p className="text-[11px] text-muted-foreground">
              {isResponding ? "Yanıt hazırlanıyor..." : "Çevrimiçi"}
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
            <div className={cn("mx-auto w-full max-w-2xl px-4 py-5", !isEmpty && "space-y-5")}>
              {isEmpty ? (
                <WelcomeScreen
                  userName={USER_NAME}
                  onSelect={(prompt) => chatStore.sendMessage(prompt)}
                />
              ) : (
                messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isLastAssistant={message.id === lastAssistantId}
                    busy={isResponding}
                  />
                ))
              )}
            </div>
          </div>

          {showScrollButton && <ScrollToBottomButton onClick={() => scrollToBottom("smooth")} />}

          <ChatInput onSend={(text) => chatStore.sendMessage(text)} disabled={isResponding} />
        </div>
      </div>
    </div>
  );
}
