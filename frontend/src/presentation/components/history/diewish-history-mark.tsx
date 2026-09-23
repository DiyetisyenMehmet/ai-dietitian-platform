import { cn } from "@/shared/lib/utils";

/**
 * Reuses the two-leaf shape and colors from the existing Diewish dashboard
 * mascot. History summaries are part of Diewish, not a separate AI product.
 */
export function DiewishHistoryMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 28"
      fill="none"
      className={cn("size-5 shrink-0", className)}
      data-diewish-history-mark="leaf"
      aria-hidden="true"
    >
      <path
        d="M16 26C16.2 20.7 15.8 15.5 16.3 10.2"
        stroke="#168D69"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15.8 11.6C11.2 12.1 6.6 9.4 5.1 4.1C10.2 2.8 14.9 5.9 15.8 11.6Z"
        fill="#149A73"
      />
      <path
        d="M16.4 9.9C17.7 5.2 21.9 2.1 27.1 2.9C26.3 8 22.1 11.2 16.4 9.9Z"
        fill="#0D8F69"
      />
      <path
        d="M7.1 5.2C9.7 6.8 12.1 8.5 14.7 10.6M25.2 4.2C22.7 5.6 20.4 7.2 17.5 9.1"
        stroke="#D8FFF0"
        strokeOpacity=".55"
        strokeWidth=".8"
        strokeLinecap="round"
      />
    </svg>
  );
}
