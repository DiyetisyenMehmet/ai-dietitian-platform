import * as React from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

/**
 * Approved Diewish Coach bottom-navigation mark.
 *
 * The shape is vector-traced from the approved reference and deliberately uses
 * currentColor so the shared navigation owns active/inactive colors in every theme.
 */
export const CoachNavIcon: LucideIcon = React.forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      data-coach-nav-icon=""
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.20 16.22L9.33 16.72L9.86 17.23L11.50 17.69L13.10 17.29L13.90 16.46L13.87 16.09L13.54 15.79L13.14 15.82L12.57 16.32L11.87 16.56L10.86 16.49L9.83 15.79L9.36 15.92ZM12.53 13.82L12.60 14.25L12.97 14.52L13.40 14.42L14.10 13.59L14.60 13.42L15.31 13.55L16.11 14.62L16.61 14.62L16.91 14.19L16.67 13.39L16.21 12.82L15.01 12.32L13.57 12.62L12.80 13.29ZM6.22 13.95L6.26 14.39L6.59 14.65L7.06 14.59L7.53 13.82L8.13 13.45L8.96 13.55L9.90 14.52L10.33 14.42L10.56 13.99L9.93 12.88L8.66 12.32L7.83 12.38L7.13 12.72ZM17.74 5.14L15.31 5.67L13.44 6.67L12.33 7.98L11.97 9.51L12.20 9.55L13.34 8.74L15.97 7.44L16.97 6.51ZM20.28 2.13L19.81 2.00L17.91 2.63L14.34 2.93L12.67 3.47L10.96 4.94L10.13 6.84L8.69 7.08L7.43 7.64L6.09 8.61L4.95 9.88L4.05 11.38L3.55 12.75L3.42 15.56L3.79 17.09L4.35 18.29L5.12 19.36L6.19 20.36L7.43 21.13L9.13 21.73L10.90 21.97L12.67 21.90L14.57 21.47L15.94 20.86L17.14 20.06L18.21 18.99L19.41 16.79L19.75 14.29L19.18 11.48L18.14 9.58L19.38 8.44L20.31 6.64L20.61 4.20ZM19.25 3.60L19.21 5.91L18.28 7.78L16.74 8.91L15.57 9.28L13.60 9.51L13.24 9.81L13.40 10.21L14.47 10.55L16.91 10.25L17.88 11.78L18.34 13.62L18.34 15.26L17.88 16.92L17.11 18.19L15.31 19.70L13.84 20.33L12.47 20.60L9.63 20.50L8.29 20.06L6.92 19.23L5.49 17.56L4.72 15.19L4.99 12.65L6.16 10.48L7.59 9.15L9.66 8.28L10.20 8.24L10.66 9.21L11.10 9.58L11.47 9.58L11.33 7.51L11.60 6.51L12.17 5.61L13.37 4.67L14.60 4.27L17.71 3.97Z"
      />
    </svg>
  ),
);

CoachNavIcon.displayName = "CoachNavIcon";
