"use client";

import * as React from "react";
import { EllipsisVertical, EyeOff } from "lucide-react";

import {
  visibleDashboardCardIds,
  type DashboardCardId,
  type DashboardCardPreferences,
} from "@/domain/account/dashboard-card-preferences";
import {
  dashboardCardLabel,
  DashboardRegisteredCard,
} from "@/presentation/components/dashboard/dashboard-card-registry";
import { useDashboardInlineReorder } from "@/presentation/components/dashboard/use-dashboard-inline-reorder";
import { cn } from "@/shared/lib/utils";

export interface DashboardPersonalizedCardsProps {
  preferences: DashboardCardPreferences;
  editing: boolean;
  saving: boolean;
  onHide: (id: DashboardCardId) => void;
  onOrderPreview: (ids: DashboardCardId[]) => void;
  onOrderCommit: (ids: DashboardCardId[]) => void | Promise<unknown>;
}

export function DashboardPersonalizedCards({
  preferences,
  editing,
  saving,
  onHide,
  onOrderPreview,
  onOrderCommit,
}: DashboardPersonalizedCardsProps) {
  const visible = visibleDashboardCardIds(preferences);
  const reorder = useDashboardInlineReorder<DashboardCardId>({
    group: "cards",
    axis: "y",
    ids: visible,
    disabled: saving || !editing,
    onPreview: onOrderPreview,
    onCommit: onOrderCommit,
  });

  const blockNavigation = React.useCallback(
    (event: React.SyntheticEvent) => {
      if (
        !editing ||
        (event.target as HTMLElement).closest("[data-dashboard-personalization-control]")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
    },
    [editing],
  );

  return (
    <section id="diewish-tools" className="w-full" aria-label="Diewish araçları">
      <div data-dashboard-personalized-card-list>
        {visible.map((id, index) => (
          <div
            key={id}
            data-dashboard-card-slot={id}
            data-personalize-group="cards"
            data-personalize-item={id}
            onPointerDown={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("[data-dashboard-personalization-control]")) return;
              reorder.onPointerDown(event, id);
            }}
            onTouchStart={(event) => {
              if ((event.target as HTMLElement).closest("[data-dashboard-personalization-control]"))
                return;
              reorder.onTouchStart(event, id);
            }}
            onContextMenu={(event) => {
              if (editing) event.preventDefault();
            }}
            style={{ containerType: "inline-size" }}
            className={cn(
              "relative",
              index === 0 ? "" : index === 3 ? "mt-5" : "mt-[clamp(0.65rem,2.2vw,0.95rem)]",
              editing && "cursor-grab touch-pan-y select-none",
              reorder.draggingId === id && "z-40 cursor-grabbing drop-shadow-lg",
            )}
            data-dashboard-card-drag-surface={editing ? id : undefined}
          >
            <div
              className={cn(
                editing &&
                  id !== "coach" &&
                  "pointer-events-none select-none [&_[data-dashboard-coach-chevron]]:invisible [&_[data-dashboard-feature-chevron]_svg]:invisible",
              )}
              onClickCapture={blockNavigation}
              onKeyDownCapture={(event) => {
                if (editing && (event.key === "Enter" || event.key === " ")) {
                  blockNavigation(event);
                }
              }}
              aria-hidden={(editing && id !== "coach") || undefined}
              inert={(editing && id !== "coach") || undefined}
            >
              <DashboardRegisteredCard
                id={id}
                editing={editing}
                saving={saving}
                onHide={() => onHide(id)}
              />
            </div>

            {editing && (
              <>
                <button
                  type="button"
                  aria-label={`${dashboardCardLabel(id)} kartını sürükle. Yukarı ve aşağı ok tuşlarıyla sırala.`}
                  aria-grabbed={reorder.draggingId === id}
                  disabled={saving}
                  onKeyDown={(event) => reorder.onKeyDown(event, id)}
                  className="absolute -left-2 top-1/2 z-30 flex h-8 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground/80 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  data-dashboard-card-drag-handle={id}
                >
                  <EllipsisVertical className="size-4" aria-hidden="true" />
                </button>

                {id !== "coach" && (
                  <button
                    type="button"
                    aria-label={`${dashboardCardLabel(id)} kartını gizle`}
                    disabled={saving}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onHide(id)}
                    className={cn(
                      "pointer-events-auto absolute right-[1%] top-1/2 z-40 flex size-[8cqw] -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-[0_1px_4px_rgba(15,23,42,0.12)] transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-[#164554] dark:bg-[#06283c] dark:text-slate-300 dark:shadow-none",
                    )}
                    data-dashboard-personalization-control
                    data-dashboard-card-hide={id}
                  >
                    <EyeOff className="size-[4.5cqw]" aria-hidden="true" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
