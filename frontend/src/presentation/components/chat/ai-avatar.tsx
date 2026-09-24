import { cn } from "@/shared/lib/utils";
import { DiewishHistoryMark } from "@/presentation/components/history/diewish-history-mark";

/** Gradient Diewish Coach avatar. Pulses gently while active. */
export function AiAvatar({ active = false, className }: { active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-soft",
        className,
      )}
    >
      {active && (
        <span
          className="absolute inset-0 animate-ping rounded-full bg-primary/40"
          aria-hidden="true"
        />
      )}
      <DiewishHistoryMark className="relative size-4 brightness-0 invert" />
    </span>
  );
}
