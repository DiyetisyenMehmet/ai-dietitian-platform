"use client";

import * as React from "react";
import { MessageSquare, MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
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

type ConversationTarget = { id: string; title: string };

const TITLE_MAX_LENGTH = 80;

function relativeDay(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  return `${days} gün önce`;
}

/** Conversation list: New Chat + persisted conversation history and safe actions. */
export function ChatSidebar({ open, onClose }: ChatSidebarProps) {
  const { conversations, activeId, isResponding } = useChatState();
  const [actionTarget, setActionTarget] = React.useState<ConversationTarget | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ConversationTarget | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<ConversationTarget | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const ordered = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const openRename = React.useCallback((target: ConversationTarget) => {
    setActionTarget(null);
    setRenameTarget(target);
    setRenameValue(target.title);
  }, []);

  const confirmRename = React.useCallback(async () => {
    if (!renameTarget || isRenaming) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed.length > TITLE_MAX_LENGTH) return;

    setIsRenaming(true);
    const renamed = await chatStore.renameConversation(renameTarget.id, trimmed);
    setIsRenaming(false);
    if (renamed) {
      setRenameTarget(null);
      setRenameValue("");
    }
  }, [isRenaming, renameTarget, renameValue]);

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
                  disabled={isResponding || isDeleting || isRenaming}
                  onClick={() => setActionTarget({ id: conv.id, title: conv.title })}
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

      <Modal open={Boolean(actionTarget)} onOpenChange={(nextOpen) => !nextOpen && setActionTarget(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Sohbet seçenekleri</ModalTitle>
            <ModalDescription className="truncate">{actionTarget?.title}</ModalDescription>
          </ModalHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => actionTarget && openRename(actionTarget)}
            >
              <Pencil aria-hidden="true" />
              Yeniden adlandır
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              onClick={() => {
                if (!actionTarget) return;
                setPendingDelete(actionTarget);
                setActionTarget(null);
              }}
            >
              <Trash2 aria-hidden="true" />
              Sohbeti sil
            </Button>
          </div>
        </ModalContent>
      </Modal>

      <Modal
        open={Boolean(renameTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isRenaming) {
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Sohbeti yeniden adlandır</ModalTitle>
            <ModalDescription>Kolay bulabileceğin kısa ve açıklayıcı bir ad kullan.</ModalDescription>
          </ModalHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void confirmRename();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Input
                autoFocus
                value={renameValue}
                maxLength={TITLE_MAX_LENGTH}
                aria-label="Sohbet adı"
                onChange={(event) => setRenameValue(event.target.value)}
                disabled={isRenaming}
              />
              <p className="text-right text-xs text-muted-foreground">
                {renameValue.length}/{TITLE_MAX_LENGTH}
              </p>
            </div>
            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isRenaming}
                onClick={() => {
                  setRenameTarget(null);
                  setRenameValue("");
                }}
              >
                Vazgeç
              </Button>
              <Button
                type="submit"
                isLoading={isRenaming}
                disabled={!renameValue.trim() || renameValue.trim().length > TITLE_MAX_LENGTH}
              >
                Kaydet
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

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
