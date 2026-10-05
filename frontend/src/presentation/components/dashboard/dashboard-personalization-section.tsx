"use client";

import * as React from "react";
import { EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/application/auth/auth-store";
import { useDashboardCardPreferences } from "@/application/account/use-dashboard-card-preferences";
import {
  DEFAULT_DASHBOARD_CARD_PREFERENCES,
  hideDashboardCard,
  hideDashboardQuickAction,
  reorderVisibleDashboardCards,
  reorderVisibleDashboardQuickActions,
  showDashboardCard,
  showDashboardQuickAction,
  type DashboardCardId,
  type DashboardCardPreferences,
  type DashboardQuickActionId,
} from "@/domain/account/dashboard-card-preferences";
import {
  DashboardCardPreviewIcon,
  dashboardCardLabel,
} from "@/presentation/components/dashboard/dashboard-card-registry";
import { DashboardPersonalizedCards } from "@/presentation/components/dashboard/dashboard-personalized-cards";
import {
  DashboardQuickActionIcon,
  dashboardQuickActionMeta,
} from "@/presentation/components/dashboard/dashboard-quick-action-registry";
import { DashboardQuickActions } from "@/presentation/components/dashboard/dashboard-quick-actions";
import { Button } from "@/presentation/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/presentation/components/ui/modal";
import { cn } from "@/shared/lib/utils";

function HiddenItemsSheet({
  open,
  onOpenChange,
  preferences,
  saving,
  onShowCard,
  onShowQuickAction,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: DashboardCardPreferences;
  saving: boolean;
  onShowCard: (id: DashboardCardId) => void;
  onShowQuickAction: (id: DashboardQuickActionId) => void;
  onReset: () => Promise<boolean>;
}) {
  const [tab, setTab] = React.useState<"cards" | "quick-actions">("cards");
  const [confirmReset, setConfirmReset] = React.useState(false);
  const hiddenCards = preferences.order.filter((id) => preferences.hidden.includes(id));
  const hiddenQuickActions = preferences.quickActionOrder.filter((id) =>
    preferences.hiddenQuickActionIds.includes(id),
  );

  React.useEffect(() => {
    if (!open) setConfirmReset(false);
  }, [open]);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        className="!bottom-0 !top-auto !max-h-[82dvh] !w-full !max-w-2xl !translate-y-0 overflow-x-hidden overflow-y-auto rounded-b-none rounded-t-[28px] p-4 sm:!bottom-auto sm:!top-1/2 sm:!-translate-y-1/2 sm:rounded-[28px] sm:p-6"
        data-hidden-items-sheet
      >
        <ModalHeader className="pr-9">
          <ModalTitle className="text-xl">Gizlenenleri Gör</ModalTitle>
          <ModalDescription>
            Ana sayfanda gizlediğin içerikleri buradan yönet.
          </ModalDescription>
        </ModalHeader>

        <div
          role="tablist"
          aria-label="Gizlenen içerik türü"
          className="grid grid-cols-2 rounded-2xl bg-muted/60 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "cards"}
            onClick={() => setTab("cards")}
            className={cn(
              "min-h-11 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === "cards"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground",
            )}
          >
            Kartlar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "quick-actions"}
            onClick={() => setTab("quick-actions")}
            className={cn(
              "min-h-11 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === "quick-actions"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground",
            )}
          >
            Hızlı İşlemler
          </button>
        </div>

        {tab === "cards" ? (
          <div role="tabpanel" className="space-y-2" data-hidden-cards-panel>
            {hiddenCards.length === 0 ? (
              <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                Gizlenmiş kart bulunmuyor.
              </p>
            ) : (
              hiddenCards.map((id) => (
                <div
                  key={id}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 p-3 opacity-80"
                  data-hidden-card={id}
                >
                  <DashboardCardPreviewIcon id={id} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold">{dashboardCardLabel(id)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Ana sayfada gizli</p>
                  </div>
                  <EyeOff className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => onShowCard(id)}
                    className="min-h-10 shrink-0"
                  >
                    Göster
                  </Button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div role="tabpanel" className="space-y-2" data-hidden-quick-actions-panel>
            {hiddenQuickActions.length === 0 ? (
              <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                Gizlenmiş hızlı işlem bulunmuyor.
              </p>
            ) : (
              hiddenQuickActions.map((id) => {
                const meta = dashboardQuickActionMeta(id);
                return (
                  <div
                    key={id}
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 p-3 opacity-80"
                    data-hidden-quick-action={id}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background">
                      <DashboardQuickActionIcon id={id} className="size-5 sm:size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold">{meta.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Ana sayfada gizli</p>
                    </div>
                    <EyeOff className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => onShowQuickAction(id)}
                      className="min-h-10 shrink-0"
                    >
                      Göster
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="border-t border-border pt-3">
          {!confirmReset ? (
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setConfirmReset(true)}
              className="min-h-11 w-full justify-center text-muted-foreground"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Varsayılana Dön
            </Button>
          ) : (
            <div className="rounded-2xl border border-border bg-muted/25 p-3" data-reset-confirmation>
              <p className="text-sm font-semibold">Dashboard düzeni varsayılana döndürülsün mü?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Kartlar ve hızlı işlemler sistem sırasına döner; gizlenen öğeler tekrar görünür olur.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => setConfirmReset(false)}
                >
                  Vazgeç
                </Button>
                <Button
                  type="button"
                  size="sm"
                  isLoading={saving}
                  onClick={() => {
                    void onReset().then((ok) => {
                      if (ok) setConfirmReset(false);
                    });
                  }}
                >
                  Varsayılana Dön
                </Button>
              </div>
            </div>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}

export function DashboardPersonalizationSection() {
  const { user } = useAuth();
  const { preferences, loading, saving, error, save, reload } =
    useDashboardCardPreferences(user?.id);
  const [draft, setDraft] = React.useState(preferences);
  const draftRef = React.useRef(preferences);
  const [editing, setEditing] = React.useState(false);
  const [hiddenOpen, setHiddenOpen] = React.useState(false);

  const updateDraft = React.useCallback((next: DashboardCardPreferences) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  React.useEffect(() => {
    updateDraft(preferences);
  }, [preferences, updateDraft]);

  const persist = React.useCallback(
    async (next: DashboardCardPreferences, failureMessage: string) => {
      updateDraft(next);
      const ok = await save(next);
      if (!ok) toast.error(failureMessage);
      return ok;
    },
    [save, updateDraft],
  );

  const previewCards = React.useCallback(
    (ids: DashboardCardId[]) => {
      updateDraft(reorderVisibleDashboardCards(draftRef.current, ids));
    },
    [updateDraft],
  );
  const commitCards = React.useCallback(
    (ids: DashboardCardId[]) =>
      persist(
        reorderVisibleDashboardCards(draftRef.current, ids),
        "Kart sırası kaydedilemedi.",
      ),
    [persist],
  );

  const previewQuickActions = React.useCallback(
    (ids: DashboardQuickActionId[]) => {
      updateDraft(reorderVisibleDashboardQuickActions(draftRef.current, ids));
    },
    [updateDraft],
  );
  const commitQuickActions = React.useCallback(
    (ids: DashboardQuickActionId[]) =>
      persist(
        reorderVisibleDashboardQuickActions(draftRef.current, ids),
        "Hızlı işlem sırası kaydedilemedi.",
      ),
    [persist],
  );

  const hideCard = React.useCallback(
    (id: DashboardCardId) => {
      const result = hideDashboardCard(draftRef.current, id);
      if (!result.changed) {
        toast.info("Ana ekranda en az 3 kart bulunmalı.");
        return;
      }
      void persist(result.preferences, "Kart gizleme tercihi kaydedilemedi.");
    },
    [persist],
  );

  const hideQuickAction = React.useCallback(
    (id: DashboardQuickActionId) => {
      const result = hideDashboardQuickAction(draftRef.current, id);
      if (!result.changed) {
        toast.info("Ana ekranda en az 3 hızlı işlem bulunmalı.");
        return;
      }
      void persist(result.preferences, "Hızlı işlem tercihi kaydedilemedi.");
    },
    [persist],
  );

  const showCard = React.useCallback(
    (id: DashboardCardId) => {
      void persist(
        showDashboardCard(draftRef.current, id),
        "Kart gösterme tercihi kaydedilemedi.",
      );
    },
    [persist],
  );

  const showQuickAction = React.useCallback(
    (id: DashboardQuickActionId) => {
      void persist(
        showDashboardQuickAction(draftRef.current, id),
        "Hızlı işlem tercihi kaydedilemedi.",
      );
    },
    [persist],
  );

  const toggleEditing = React.useCallback(() => {
    setEditing((current) => {
      if (current) setHiddenOpen(false);
      return !current;
    });
  }, []);

  return (
    <section
      className="space-y-3"
      aria-label="Ana ekran kişiselleştirme alanı"
      data-dashboard-personalization
      data-editing={editing ? "true" : "false"}
      data-saving={saving ? "true" : "false"}
    >
      <DashboardQuickActions
        editing={editing}
        visibleActionIds={draft.quickActionOrder.filter(
          (id) => !draft.hiddenQuickActionIds.includes(id),
        )}
        savingPreferences={saving || loading}
        onToggleEditing={toggleEditing}
        onHideAction={hideQuickAction}
        onOrderPreview={previewQuickActions}
        onOrderCommit={commitQuickActions}
      />

      <DashboardPersonalizedCards
        preferences={draft}
        editing={editing}
        saving={saving || loading}
        onHide={hideCard}
        onOrderPreview={previewCards}
        onOrderCommit={commitCards}
      />

      {editing && (
        <div className="flex min-w-0 items-center justify-between gap-2 pt-1">
          {error ? (
            <button
              type="button"
              onClick={() => void reload()}
              className="min-h-10 text-left text-xs font-medium text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Düzen kaydedilemedi · yeniden dene
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Tutup sürükleyerek sıralayabilirsin.
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHiddenOpen(true)}
            className="min-h-10 shrink-0"
            data-open-hidden-items
          >
            <EyeOff className="size-4" aria-hidden="true" />
            Gizlenenleri Gör
          </Button>
        </div>
      )}

      <HiddenItemsSheet
        open={hiddenOpen}
        onOpenChange={setHiddenOpen}
        preferences={draft}
        saving={saving}
        onShowCard={showCard}
        onShowQuickAction={showQuickAction}
        onReset={() =>
          persist(
            DEFAULT_DASHBOARD_CARD_PREFERENCES,
            "Varsayılan düzen geri yüklenemedi.",
          )
        }
      />
    </section>
  );
}
