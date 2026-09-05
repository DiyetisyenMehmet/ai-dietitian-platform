"use client";

import * as React from "react";
import {
  Copy,
  MessageSquare,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { Conversation } from "@/domain/chat/types";
import {
  formatConversationForShare,
  loadConversationForShare,
} from "@/application/chat/conversation-share";
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
  open: boolean;
  onClose: () => void;
}

type ConversationTarget = { id: string; title: string; pinnedAt: number | null };

const TITLE_MAX_LENGTH = 80;

function relativeDay(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  return `${days} gün önce`;
}

function sortByRecency(a: Conversation, b: Conversation): number {
  return b.updatedAt - a.updatedAt;
}

async function copyTranscript(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Clipboard copy failed");
}

/** Conversation list with persistent rename, pin, share and safe delete controls. */
export function ChatSidebar({ open, onClose }: ChatSidebarProps) {
  const { conversations, activeId, isResponding } = useChatState();
  const [actionTarget, setActionTarget] = React.useState<ConversationTarget | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ConversationTarget | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<ConversationTarget | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [shareConversation, setShareConversation] = React.useState<Conversation | null>(null);
  const [nativeShareAvailable, setNativeShareAvailable] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [isPinning, setIsPinning] = React.useState(false);
  const [isPreparingShare, setIsPreparingShare] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);

  React.useEffect(() => {
    setNativeShareAvailable(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const pinned = conversations
    .filter((conversation) => conversation.pinnedAt !== null)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  const regular = conversations
    .filter((conversation) => conversation.pinnedAt === null)
    .sort(sortByRecency);

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

  const togglePin = React.useCallback(async () => {
    if (!actionTarget || isPinning) return;
    setIsPinning(true);
    const updated = await chatStore.setConversationPinned(
      actionTarget.id,
      actionTarget.pinnedAt === null,
    );
    setIsPinning(false);
    if (updated) setActionTarget(null);
  }, [actionTarget, isPinning]);

  const prepareShare = React.useCallback(async () => {
    if (!actionTarget || isPreparingShare) return;
    const target = actionTarget;
    setIsPreparingShare(true);
    try {
      const conversation = await loadConversationForShare(target.id);
      setActionTarget(null);
      setShareConversation(conversation);
    } catch {
      toast.error("Sohbet paylaşım için yüklenemedi. Lütfen tekrar dene.");
    } finally {
      setIsPreparingShare(false);
    }
  }, [actionTarget, isPreparingShare]);

  const executeShare = React.useCallback(async () => {
    if (!shareConversation || isSharing) return;
    const text = formatConversationForShare(shareConversation);
    setIsSharing(true);

    try {
      if (nativeShareAvailable && typeof navigator.share === "function") {
        await navigator.share({
          title: `Diewish — ${shareConversation.title}`,
          text,
        });
        setShareConversation(null);
        return;
      }

      await copyTranscript(text);
      toast.success("Sohbet panoya kopyalandı.");
      setShareConversation(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Sohbet paylaşılamadı. Lütfen tekrar dene.");
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, nativeShareAvailable, shareConversation]);

  const confirmDelete = React.useCallback(async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    const deleted = await chatStore.deleteConversation(pendingDelete.id);
    setIsDeleting(false);
    if (deleted) setPendingDelete(null);
  }, [isDeleting, pendingDelete]);

  const renderConversation = (conv: Conversation) => {
    const active = conv.id === activeId;
    const persisted = !isDraftConversationId(conv.id);
    const target: ConversationTarget = { id: conv.id, title: conv.title, pinnedAt: conv.pinnedAt };

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
          {conv.pinnedAt !== null ? (
            <Pin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <MessageSquare
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
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
            disabled={
              isResponding || isDeleting || isRenaming || isPinning || isPreparingShare || isSharing
            }
            onClick={() => setActionTarget(target)}
            className="mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

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

      <nav className="flex-1 space-y-4 overflow-y-auto">
        {pinned.length > 0 && (
          <section>
            <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sabitlenenler
            </p>
            <div className="space-y-1">{pinned.map(renderConversation)}</div>
          </section>
        )}

        <section>
          <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Önceki Sohbetler
          </p>
          <div className="space-y-1">{regular.map(renderConversation)}</div>
        </section>
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden w-72 shrink-0 border-r border-border bg-card/40 lg:block">
        {panel}
      </aside>

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
        open={Boolean(actionTarget)}
        onOpenChange={(nextOpen) =>
          !nextOpen && !isPinning && !isPreparingShare && setActionTarget(null)
        }
      >
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
              isLoading={isPinning}
              disabled={isPreparingShare}
              onClick={() => void togglePin()}
            >
              {!isPinning &&
                (actionTarget?.pinnedAt !== null ? (
                  <PinOff aria-hidden="true" />
                ) : (
                  <Pin aria-hidden="true" />
                ))}
              {actionTarget?.pinnedAt !== null ? "Sabitlemeyi kaldır" : "Sabitle"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              disabled={isPinning || isPreparingShare}
              onClick={() => actionTarget && openRename(actionTarget)}
            >
              <Pencil aria-hidden="true" />
              Yeniden adlandır
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              isLoading={isPreparingShare}
              disabled={isPinning}
              onClick={() => void prepareShare()}
            >
              {!isPreparingShare && <Share2 aria-hidden="true" />}
              Sohbeti paylaş
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              disabled={isPinning || isPreparingShare}
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
        open={Boolean(shareConversation)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isSharing) setShareConversation(null);
        }}
      >
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Sohbeti paylaş</ModalTitle>
            <ModalDescription>
              {shareConversation
                ? `“${shareConversation.title}” sohbetindeki ${shareConversation.messages.length} mesaj paylaşılacak.`
                : "Sohbet paylaşılacak."}
            </ModalDescription>
          </ModalHeader>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            Sohbet sağlık veya beslenme bilgileri içerebilir. Paylaşacağın uygulamayı ve kişiyi kontrol et.
          </div>
          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSharing}
              onClick={() => setShareConversation(null)}
            >
              Vazgeç
            </Button>
            <Button type="button" isLoading={isSharing} onClick={() => void executeShare()}>
              {!isSharing &&
                (nativeShareAvailable ? <Share2 aria-hidden="true" /> : <Copy aria-hidden="true" />)}
              {nativeShareAvailable ? "Paylaş" : "Panoya kopyala"}
            </Button>
          </ModalFooter>
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
