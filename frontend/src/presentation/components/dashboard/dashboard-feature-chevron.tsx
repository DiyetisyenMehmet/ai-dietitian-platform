/**
 * One chevron treatment for all three dashboard feature cards.
 * The opaque circle intentionally covers the chevron baked into legacy artwork,
 * so light/dark and Food/Blood/Progress all present the same control geometry.
 *
 * The arrow itself is drawn with a CSS pseudo-element. Keeping this component
 * single-node avoids Playwright's JSX child transform from creating a non-React
 * test object while preserving the exact interactive geometry.
 */
export function DashboardFeatureChevron() {
  return (
    <span
      className="pointer-events-none absolute right-[1%] top-1/2 z-30 flex size-[8cqw] -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white text-[#223552] shadow-[0_1px_4px_rgba(15,23,42,0.12)] after:block after:size-[2.15cqw] after:rotate-45 after:border-r-[0.55cqw] after:border-t-[0.55cqw] after:border-current after:content-[''] dark:border-[#164554] dark:bg-[#06283c] dark:text-[#effbff] dark:shadow-none"
      aria-hidden="true"
      data-dashboard-feature-chevron
      data-dashboard-live-feature-chevron
    />
  );
}
