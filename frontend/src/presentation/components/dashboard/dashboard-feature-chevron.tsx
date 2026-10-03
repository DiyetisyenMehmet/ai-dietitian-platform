/** A flow item: the control always reserves space beside the card content. */
export function DashboardFeatureChevron() {
  return (
    <span className="dashboard-card-chevron" aria-hidden="true" data-dashboard-feature-chevron>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </span>
  );
}
