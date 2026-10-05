"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/application/auth/auth-store";
import { useDashboardCardPreferences } from "@/application/account/use-dashboard-card-preferences";
import {
  DEFAULT_DASHBOARD_CARD_PREFERENCES,
  hideDashboardCard,
  moveVisibleDashboardCard,
  reorderVisibleDashboardCards,
  showDashboardCard,
  visibleDashboardCardIds,
  type DashboardCardId,
  type DashboardCardPreferences,
} from "@/domain/account/dashboard-card-preferences";
import {
  dashboardCardLabel,
  DashboardRegisteredCard,
} from "@/presentation/components/dashboard/dashboard-card-registry";
import { Button } from "@/presentation/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/presentation/components/ui/modal";
import { cn } from "@/shared/lib/utils";

function samePreferences(
  left: DashboardCardPreferences,
  right: DashboardCardPreferences,
): boolean {
  return (
    left.order.join("|") === right.order.join("|") &&
    left.hidden.join("|") === right.hidden.join("|")
  );
}

function CardEditor({
  open,
  onOpenChange,
  preferences,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: DashboardCardPreferences;
  saving: boolean;
  onSave: (next: DashboardCardPreferences) => Promise<boolean>;
}) {
  const [draft, setDraft] = React.useState(preferences);
  const draftRef = React.useRef(preferences);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [dragging, setDragging] = React.useState<DashboardCardId | null>(null);
  const draggingRef = React.useRef<DashboardCardId | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft(preferences);
    draftRef.current = preferences;
  }, [open, preferences]);

  const updateDraft = React.useCallback((next: DashboardCardPreferences) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const persist = React.useCallback(
    async (next: DashboardCardPreferences) => {
      updateDraft(next);
      const ok = await onSave(next);
      if (!ok) {
        toast.error("Kart düzeni kaydedilemedi.");
      }
      return ok;
    },
    [onSave, updateDraft],
  );

  const visible = visibleDashboardCardIds(draft);
  const hidden = draft.order.filter((id) => draft.hidden.includes(id));

  const move = (id: DashboardCardId, direction: "up" | "down") => {
    const next = moveVisibleDashboardCard(draftRef.current, id, direction);
    if (!samePreferences(next, draftRef.current)) void persist(next);
  };

  const hide = (id: DashboardCardId) => {
    const result = hideDashboardCard(draftRef.current, id);
    if (!result.changed) {
      toast.info("Ana ekranda en az 3 kart bulunmalı.");
      return;
    }
    void persist(result.preferences);
  };

  const show = (id: DashboardCardId) => {
    void persist(showDashboardCard(draftRef.current, id));
  };

  const onPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    id: DashboardCardId,
  ) => {
    if (saving || visible.length < 2) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = id;
    setDragging(id);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const activeId = draggingRef.current;
    if (!activeId) return;
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-dashboard-card-editor-item]");
    const targetId = target?.dataset.dashboardCardEditorItem as DashboardCardId | undefined;
    const currentVisible = visibleDashboardCardIds(draftRef.current);
    if (!target || !targetId || targetId === activeId || !currentVisible.includes(targetId)) return;

    const sourceIndex = currentVisible.indexOf(activeId);
    const targetIndex = currentVisible.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const targetBox = target.getBoundingClientRect();
    const afterTarget = event.clientY > targetBox.top + targetBox.height / 2;
    let insertionIndex = targetIndex + (afterTarget ? 1 : 0);
    const nextVisible = [...currentVisible];
    nextVisible.splice(sourceIndex, 1);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    insertionIndex = Math.max(0, Math.min(insertionIndex, nextVisible.length));
    nextVisible.splice(insertionIndex, 0, activeId);

    const next = reorderVisibleDashboardCards(draftRef.current, nextVisible);
    if (!samePreferences(next, draftRef.current)) updateDraft(next);
  };

  const finishPointerDrag = (event?: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    event?.preventDefault();
    draggingRef.current = null;
    setDragging(null);
    if (!samePreferences(draftRef.current, preferences)) {
      void persist(draftRef.current);
    }
  };

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent
          className="max-h-[min(88dvh,760px)] overflow-x-hidden overflow-y-auto p-4 sm:p-6"
          data-dashboard-card-editor
          data-saving={saving ? "true" : "false"}
        >
          <ModalHeader className="pr-8">
            <ModalTitle>Ana ekran kartları</ModalTitle>
            <ModalDescription>
              Kartların sırasını değiştir, istemediğini gizle veya tekrar göster.
            </ModalDescription>
          </ModalHeader>

          <div className="space-y-2" aria-label="Görünen kartlar">
            {visible.map((id, index) => (
              <div
                key={id}
                data-dashboard-card-editor-item={id}
                className={cn(
                  "grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 rounded-2xl border border-border bg-background p-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]",
                  dragging === id && "ring-2 ring-primary/35",
                )}
              >
                <button
                  type="button"
                  aria-label={`${dashboardCardLabel(id)} kartını sürükle`}
                  disabled={saving}
                  onPointerDown={(event) => onPointerDown(event, id)}
                  onPointerMove={onPointerMove}
                  onPointerUp={finishPointerDrag}
                  onPointerCancel={() => finishPointerDrag()}
                  className="flex size-10 shrink-0 touch-none items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  data-dashboard-card-drag-handle={id}
                >
                  <GripVertical className="size-5" aria-hidden="true" />
                </button>

                <span className="min-w-0 flex-1 break-words text-sm font-semibold">
                  {dashboardCardLabel(id)}
                </span>

                <div className="col-span-2 flex min-w-0 items-center justify-end gap-1 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  <button
                    type="button"
                    aria-label={`${dashboardCardLabel(id)} kartını yukarı taşı`}
                    disabled={saving || index === 0}
                    onClick={() => move(id, "up")}
                    className="flex size-10 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${dashboardCardLabel(id)} kartını aşağı taşı`}
                    disabled={saving || index === visible.length - 1}
                    onClick={() => move(id, "down")}
                    className="flex size-10 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${dashboardCardLabel(id)} kartını gizle`}
                    disabled={saving}
                    onClick={() => hide(id)}
                    className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <EyeOff className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {hidden.length > 0 && (
            <section className="space-y-2" aria-label="Gizlenen kartlar">
              <h3 className="text-sm font-semibold text-muted-foreground">Gizlenen kartlar</h3>
              {hidden.map((id) => (
                <div
                  key={id}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/25 p-3"
                >
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">
                    {dashboardCardLabel(id)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() => show(id)}
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    Göster
                  </Button>
                </div>
              ))}
            </section>
          )}

          <div className="border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => setResetOpen(true)}
              className="w-full justify-center text-muted-foreground"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Varsayılana Dön
            </Button>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={resetOpen} onOpenChange={setResetOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Varsayılan düzene dön?</ModalTitle>
            <ModalDescription>
              Dashboard kart düzeni varsayılana döndürülsün mü?
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              isLoading={saving}
              onClick={() => {
                void persist(DEFAULT_DASHBOARD_CARD_PREFERENCES).then((ok) => {
                  if (ok) setResetOpen(false);
                });
              }}
            >
              Varsayılana Dön
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export function DashboardPersonalizedCards() {
  const { user } = useAuth();
  const { preferences, loading, saving, error, save, reload } =
    useDashboardCardPreferences(user?.id);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const visible = visibleDashboardCardIds(preferences);

  return (
    <section id="diewish-tools" className="w-full" aria-label="Diewish araçları">
      <div className="mb-2 flex min-h-9 items-center justify-end">
        {error && (
          <button
            type="button"
            className="mr-auto text-xs font-medium text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void reload()}
          >
            Kart düzenini yenile
          </button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditorOpen(true)}
          disabled={loading || !user}
          aria-label="Ana ekran kartlarını düzenle"
          className="h-9 px-3 text-xs text-muted-foreground"
        >
          <Settings2 className="size-4" aria-hidden="true" />
          Düzenle
        </Button>
      </div>

      <div data-dashboard-personalized-card-list>
        {visible.map((id, index) => (
          <div
            key={id}
            data-dashboard-card-slot={id}
            className={
              index === 0
                ? ""
                : index === 3
                  ? "mt-5"
                  : "mt-[clamp(0.65rem,2.2vw,0.95rem)]"
            }
          >
            <DashboardRegisteredCard id={id} />
          </div>
        ))}
      </div>

      <CardEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        preferences={preferences}
        saving={saving}
        onSave={save}
      />
    </section>
  );
}
