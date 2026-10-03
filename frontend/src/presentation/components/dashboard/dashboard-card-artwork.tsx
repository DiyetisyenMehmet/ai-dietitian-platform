import type { CSSProperties } from "react";

export interface DashboardArtworkRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Source coordinates belong only to decorative pixels, never to live text. */
export function DashboardCardArtwork({
  src,
  source,
  region,
  className,
  style,
}: {
  src: string;
  source: { width: number; height: number };
  region: DashboardArtworkRegion;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`}
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
      data-dashboard-artwork
    >
      <image href={src} width={source.width} height={source.height} />
    </svg>
  );
}
