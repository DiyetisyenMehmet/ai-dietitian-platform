"use client";

import * as React from "react";
import { EyeOff, GripVertical } from "lucide-react";

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
      if (!editing) return;
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
            className={cn(
              "relative transition-[transform,filter] duration-150",
              index === 0
                ? ""
                : index === 3
                  ? "mt-5"
                  : "mt-[clamp(0.65rem,2.2vw,0.95rem)]",
              reorder.draggingId === id && "z-20 scale-[1.01] drop-shadow-lg",
            )}
          >
            <div
              className={cn(editing && "pointer-events-none select-none")}
              onClickCapture={blockNavigation}
              onKeyDownCapture={(event) => {
                if (editing && (event.key === "Enter" || event.key === " ")) {
                  blockNavigation(event);
                }
              }}
              aria-hidden={editing || undefined}
            >
              <DashboardRegisteredCard id={id} />
            </div>

            {editing && (
              <>
                <button
                  type="button"
                  aria-label={`${dashboardCardLabel(id)} kartını sürükle. Yukarı ve aşağı ok tuşlarıyla sırala.`}
                  aria-grabbed={reorder.draggingId === id}
                  disabled={saving}
                  onPointerDown={(event) => reorder.onPointerDown(event, id)}
                  onKeyDown={(event) => reorder.onKeyDown(event, id)}
                  className="absolute -left-1 top-1/2 z-30 flex size-11 -translate-y-1/2 touch-none items-center justify-center rounded-full border border-border/80 bg-background/95 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  data-dashboard-card-drag-handle={id}
                >
                  <GripVertical className="size-5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  aria-label={`${dashboardCardLabel(id)} kartını gizle`}
                  disabled={saving}
                  onClick={() => onHide(id)}
                  className="absolute right-2 top-2 z-30 flex size-11 items-center justify-center rounded-full border border-border/80 bg-background/95 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  data-dashboard-card-hide={id}
                >
                  <EyeOff className="size-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
