import { cn } from "@/shared/lib/utils";
import { GOAL_STATUS_LABEL, type GoalStatus } from "@/domain/goals/types";
import { STATUS_BADGE } from "./goal-visuals";

/** Small rounded status pill for a goal. */
export function StatusBadge({ status, className }: { status: GoalStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        STATUS_BADGE[status],
        className,
      )}
    >
      {GOAL_STATUS_LABEL[status]}
    </span>
  );
}
