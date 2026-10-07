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
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { AiAvatar } from "./ai-avatar";

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
import { chatStore, isDraftConversationId, useChatState } from "@/application/chat/chat-store";

interface ChatSidebarProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
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
export function ChatSidebar({ open, onClose, triggerRef }: ChatSidebarProps) {
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
    setNativeShareAvailable(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

  const [desktop, setDesktop] = React.useState(false);
  const actionButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setDesktop(query.matches);
      if (query.matches) onClose();
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [onClose]);

  const restoreActionFocus = (event: Event) => {
    event.preventDefault();
    if (actionTarget || renameTarget || shareConversation || pendingDelete) return;
    requestAnimationFrame(() => {
      const target = actionButtonRef.current;
      if (target?.isConnected) target.focus();
      else triggerRef.current?.focus();
    });
  };

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
          "group flex items-center rounded-2xl transition-colors",
          active ? "bg-primary/10 text-foreground" : "hover:bg-accent/50",
        )}
      >
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          onClick={() => {
            chatStore.selectConversation(conv.id);
            onClose();
          }}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            onClick={(event) => {
              actionButtonRef.current = event.currentTarget;
              setActionTarget(target);
            }}
            className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100"
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

  const panel = (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4 p-4">
      <Button
        className="min-h-12 w-full justify-start rounded-full px-4"
        onClick={() => {
          chatStore.newChat();
          onClose();
        }}
      >
        <Plus aria-hidden="true" />
        Yeni Sohbet
      </Button>

      <nav
        aria-label="Sohbetler"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain"
      >
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
      {desktop && (
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/40">
          {panel}
        </aside>
      )}

      <Modal
        open={open && !desktop}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
      >
        <ModalContent
          variant="drawer"
          data-coach-drawer
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!actionTarget && !renameTarget && !pendingDelete && !shareConversation)
              triggerRef.current?.focus();
          }}
        >
          <ModalHeader className="shrink-0 border-b border-border/60 px-4 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <ModalTitle className="flex items-center gap-3 pr-12 text-lg leading-8">
              <AiAvatar className="size-9" />
              Diewish Koç
            </ModalTitle>
            <ModalDescription className="sr-only">
              Önceki sohbetlerini seç veya yeni bir sohbet başlat.
            </ModalDescription>
          </ModalHeader>
          {panel}
        </ModalContent>
      </Modal>

      <Modal
        open={Boolean(actionTarget)}
        onOpenChange={(nextOpen) =>
          !nextOpen && !isPinning && !isPreparingShare && setActionTarget(null)
        }
      >
        <ModalContent
          variant="centered"
          className="max-w-sm rounded-3xl p-5"
          onCloseAutoFocus={restoreActionFocus}
          closeDisabled={isPinning || isPreparingShare}
          data-coach-options
        >
          <ModalHeader className="min-w-0">
            <ModalTitle className="pr-12 leading-8">Sohbet seçenekleri</ModalTitle>
            <ModalDescription
              className="w-full min-w-0 truncate"
              title={actionTarget?.title}
              data-conversation-option-title
            >
              {actionTarget?.title}
            </ModalDescription>
          </ModalHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-14 justify-start gap-3 whitespace-normal rounded-full px-4 py-3 [&>svg:first-child]:size-5 [&>svg:first-child]:shrink-0"
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
              <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-14 justify-start gap-3 whitespace-normal rounded-full px-4 py-3 [&>svg:first-child]:size-5 [&>svg:first-child]:shrink-0"
              disabled={isPinning || isPreparingShare}
              onClick={() => actionTarget && openRename(actionTarget)}
            >
              <Pencil aria-hidden="true" />
              Yeniden adlandır
              <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-14 justify-start gap-3 whitespace-normal rounded-full px-4 py-3 [&>svg:first-child]:size-5 [&>svg:first-child]:shrink-0"
              isLoading={isPreparingShare}
              disabled={isPinning}
              onClick={() => void prepareShare()}
            >
              {!isPreparingShare && <Share2 aria-hidden="true" />}
              Sohbeti paylaş
              <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-14 justify-start gap-3 whitespace-normal rounded-full border-destructive/20 bg-destructive/5 px-4 py-3 text-destructive hover:bg-destructive/10 hover:text-destructive [&>svg:first-child]:size-5"
              disabled={isPinning || isPreparingShare}
              onClick={() => {
                if (!actionTarget) return;
                setPendingDelete(actionTarget);
                setActionTarget(null);
              }}
            >
              <Trash2 aria-hidden="true" />
              Sohbeti sil
              <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
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
        <ModalContent
          variant="centered"
          className="max-w-sm rounded-3xl p-5"
          onCloseAutoFocus={restoreActionFocus}
          closeDisabled={isSharing}
        >
          <ModalHeader className="min-w-0">
            <ModalTitle className="pr-12 leading-snug">Sohbeti paylaş</ModalTitle>
            <ModalDescription>
              {shareConversation
                ? `“${shareConversation.title}” sohbetindeki ${shareConversation.messages.length} mesaj paylaşılacak.`
                : "Sohbet paylaşılacak."}
            </ModalDescription>
          </ModalHeader>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            Sohbet sağlık veya beslenme bilgileri içerebilir. Paylaşacağın uygulamayı ve kişiyi
            kontrol et.
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
                (nativeShareAvailable ? (
                  <Share2 aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                ))}
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
        <ModalContent
          variant="centered"
          className="max-w-sm rounded-3xl p-5"
          onCloseAutoFocus={restoreActionFocus}
          closeDisabled={isRenaming}
        >
          <ModalHeader className="min-w-0">
            <ModalTitle className="pr-12 leading-snug">Sohbeti yeniden adlandır</ModalTitle>
            <ModalDescription>
              Kolay bulabileceğin kısa ve açıklayıcı bir ad kullan.
            </ModalDescription>
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
        <ModalContent
          variant="centered"
          className="max-w-sm rounded-3xl p-5"
          onCloseAutoFocus={restoreActionFocus}
          closeDisabled={isDeleting}
        >
          <ModalHeader className="min-w-0">
            <ModalTitle className="pr-12 leading-snug">Sohbet silinsin mi?</ModalTitle>
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
