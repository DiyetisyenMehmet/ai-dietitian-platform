"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, ChevronRight } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatNumber } from "@/shared/lib/format";
import { Card } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { getGoalTypeMeta, type Goal } from "@/domain/goals/types";
import { computeProgress, computeStatus } from "@/application/goals/goal-insights";
import { GOAL_ICON, GOAL_ACCENT, GOAL_BAR } from "./goal-visuals";
import { StatusBadge } from "./status-badge";

interface GoalCardProps {
  goal: Goal;
  /** Stagger index for the mount animation. */
  index?: number;
}

/** Premium, animated goal summary card linking to the goal details screen. */
export function GoalCard({ goal, index = 0 }: GoalCardProps) {
  const router = useRouter();
  const meta = getGoalTypeMeta(goal.type);
  const Icon = GOAL_ICON[goal.type];
  const progress = computeProgress(goal);
  const status = computeStatus(goal);

  return (
    <Card
      className="animate-fade-in overflow-hidden transition-shadow hover:shadow-card-hover"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
    >
      <Link
        href={`/goals/${goal.id}`}
        className="block p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex items-center gap-3.5">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              GOAL_ACCENT[goal.type],
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold">{goal.title}</p>
              <StatusBadge status={status} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{meta.label}</p>
          </div>
          <button
            type="button"
            aria-label="Hedefi düzenle"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/goals/${goal.id}/edit`);
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-end justify-between">
            <p className="text-sm">
              <span className="text-lg font-bold tabular-nums">
                {formatNumber(goal.currentValue)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                / {formatNumber(goal.targetValue)} {meta.unit}
              </span>
            </p>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              %{progress}
            </span>
          </div>
          <ProgressBar value={progress} indicatorClassName={GOAL_BAR[goal.type]} />
        </div>

        <div className="mt-3 flex items-center justify-end text-xs font-medium text-primary">
          Detayları gör
          <ChevronRight className="size-4" aria-hidden="true" />
        </div>
      </Link>
    </Card>
  );
}
