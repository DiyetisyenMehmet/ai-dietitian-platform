/**
 * Uniform dark-mode perimeter for all dashboard feature cards.
 *
 * Dark source artwork contains baked cyan edge glow with uneven intensity.
 * A dark inset mask first hides that legacy glow, then one consistent border
 * is drawn above it. The result is the same edge intensity on all four sides.
 */
export function DashboardCardNightBorder() {
  return (
    <span
      className="pointer-events-none absolute inset-0 z-40 hidden rounded-[clamp(0.9rem,3.6cqw,1.35rem)] border border-[#23585d] shadow-[inset_0_0_0_4px_rgba(5,30,33,0.97)] dark:block"
      aria-hidden="true"
      data-dashboard-card-night-border
    />
  );
}
