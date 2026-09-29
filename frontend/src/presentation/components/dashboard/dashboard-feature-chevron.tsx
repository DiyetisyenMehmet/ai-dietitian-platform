import { ChevronRight } from "lucide-react";

/**
 * One chevron treatment for all three dashboard feature cards.
 * The opaque circle intentionally covers the chevron baked into legacy artwork,
 * so light/dark and Food/Blood/Progress all present the same control geometry.
 */
export function DashboardFeatureChevron() {
  return (
    <span
      className="pointer-events-none absolute right-[1%] top-1/2 z-30 flex size-[8cqw] -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white text-[#223552] shadow-[0_1px_4px_rgba(15,23,42,0.12)] dark:border-[#164554] dark:bg-[#06283c] dark:text-[#effbff] dark:shadow-none"
      aria-hidden="true"
      data-dashboard-feature-chevron
    >
      <ChevronRight className="size-[5cqw]" strokeWidth={3} />
    </span>
  );
}
