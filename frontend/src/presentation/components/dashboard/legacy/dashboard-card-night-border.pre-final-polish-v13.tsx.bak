/**
 * Temporary visual normalization for the dashboard feature-card perimeter.
 *
 * The approved dark artwork contains slightly different source-edge luminance
 * on each side. This transparent overlay paints the same two-pixel inset edge
 * around the complete visible frame, so the left edge cannot look brighter
 * than the top/right/bottom edges. Light mode is intentionally untouched.
 */
export function DashboardCardNightBorder() {
  return (
    <span
      className="pointer-events-none absolute inset-0 z-40 hidden rounded-[clamp(0.9rem,3.6cqw,1.35rem)] shadow-[inset_0_0_0_2px_rgba(25,82,88,0.96)] dark:block"
      aria-hidden="true"
      data-dashboard-card-night-border
    />
  );
}
