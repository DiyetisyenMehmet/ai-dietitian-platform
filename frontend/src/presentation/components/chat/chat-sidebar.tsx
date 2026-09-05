"use client";

import * as React from "react";
import { MessageSquare, MoreVertical, Plus, Trash2, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/presentation/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/presentation/components/ui/modal";
import {
  chatStore,
  isDraftConversationId,
  useChatState,
} from "@/application/chat/chat-store";

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

/** Conversation list: New Chat + persisted conversation history. */
export function ChatSidebar({ open, onClose }: ChatSidebarProps) {
  const { conversations, activeId, isResponding } = useChatState();
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; title: string } | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = React.useState(false);
  const ordered = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const confirmDelete = React.useCallback(async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    const deleted = await chatStore.deleteConversation(pendingDelete.id);
    setIsDeleting(false);
    if (deleted) setPendingDelete(null);
  }, [isDeleting, pendingDelete]);

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
          const persisted = !isDraftConversationId(conv.id);
          return (
            <div
              key={conv.id}
              className={cn(
                "group flex items-center rounded-xl transition-colors",
                active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  chatStore.selectConversation(conv.id);
                  onClose();
                }}
                className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

              {persisted && (
                <button
                  type="button"
                  aria-label={`${conv.title} sohbet seçenekleri`}
                  title="Sohbet seçenekleri"
                  disabled={isResponding || isDeleting}
                  onClick={() => setPendingDelete({ id: conv.id, title: conv.title })}
                  className="mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                >
                  <MoreVertical className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
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

      <Modal
        open={Boolean(pendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isDeleting) setPendingDelete(null);
        }}
      >
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Sohbet silinsin mi?</ModalTitle>
            <ModalDescription>
              {pendingDelete ? `“${pendingDelete.title}”` : "Bu sohbet"} ve içindeki tüm mesajlar
              kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setPendingDelete(null)}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              isLoading={isDeleting}
              onClick={() => void confirmDelete()}
            >
              {!isDeleting && <Trash2 aria-hidden="true" />}
              Sohbeti Sil
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
