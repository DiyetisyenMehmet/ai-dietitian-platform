"use client";

import * as React from "react";
import { AlertCircle, Menu } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";
import { useActiveConversation, useChatState, chatStore } from "@/application/chat/chat-store";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { AiAvatar } from "./ai-avatar";
import { ChatSidebar } from "./chat-sidebar";
import { WelcomeScreen } from "./welcome-screen";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { ScrollToBottomButton } from "./scroll-to-bottom";

/** Full-screen AI chat experience: persisted history + backend AI composer. */
export function ChatView() {
  const conversation = useActiveConversation();
  const profile = useHealthProfile();
  const { isResponding, isLoading, error } = useChatState();
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

  React.useEffect(() => {
    if (isNearBottom()) scrollToBottom(messages.length <= 1 ? "auto" : "smooth");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, lastMessage?.content, conversation.id]);

  const handleScroll = React.useCallback(() => {
    setShowScrollButton(!isNearBottom());
  }, [isNearBottom]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col bg-background">
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
              {isResponding ? "Yanıt hazırlanıyor..." : isLoading ? "Sohbetler yükleniyor..." : "Hazır"}
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {error && !isResponding && (
        <div className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
            <div className={cn("mx-auto w-full max-w-2xl px-4 py-5", !isEmpty && "space-y-5")}>
              {isLoading && isEmpty ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Sohbet geçmişin yükleniyor…
                </div>
              ) : isEmpty ? (
                <WelcomeScreen
                  userName={profile.fullName}
                  onSelect={(prompt) => chatStore.sendMessage(prompt)}
                />
              ) : (
                messages.map((message) => <MessageBubble key={message.id} message={message} />)
              )}
            </div>
          </div>

          {showScrollButton && <ScrollToBottomButton onClick={() => scrollToBottom("smooth")} />}

          <ChatInput onSend={(text) => chatStore.sendMessage(text)} disabled={isResponding || isLoading} />
        </div>
      </div>
    </div>
  );
}
