"use client";

// Local, smoothly feathered image deformation avoids cutting/repainting the
// original fur or exposing a seam. Neutral pixels leave the source stationary.
// Only the curled tail tip moves; its root, cushion and face stay fixed.
const map = (content: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#808080"/>${content}</svg>`)}`;

const tailMap = map(
  '<defs><radialGradient id="t"><stop stop-color="#ff6080"/><stop offset="1" stop-color="#808080"/></radialGradient></defs><ellipse cx="440" cy="317" rx="65" ry="57" fill="url(#t)"/>',
);
const breathMap = map(
  '<defs><radialGradient id="b"><stop stop-color="#80ff80"/><stop offset="1" stop-color="#808080"/></radialGradient></defs><ellipse cx="202" cy="229" rx="185" ry="142" fill="url(#b)"/>',
);

export function MirmirMotion({ id, active }: { id: string; active: boolean }) {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter
          id={id}
          x="-0.03"
          y="-0.03"
          width="1.06"
          height="1.06"
          primitiveUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodColor="#808080" result="neutral" />
          <feImage href={tailMap} x="0" y="0" width="1" height="1" result="tailMap" />
          <feMerge result="safeTailMap">
            <feMergeNode in="neutral" />
            <feMergeNode in="tailMap" />
          </feMerge>
          <feDisplacementMap
            in="SourceGraphic"
            in2="safeTailMap"
            scale="0"
            xChannelSelector="R"
            yChannelSelector="G"
            result="tail"
            data-motion-part="tail"
          >
            {active && (
              <animate
                attributeName="scale"
                values="0;0;0.04;-0.026;0.018;0;0"
                keyTimes="0;0.76;0.81;0.86;0.90;0.94;1"
                calcMode="spline"
                keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
                dur="10.4s"
                repeatCount="indefinite"
              />
            )}
          </feDisplacementMap>
          <feImage href={breathMap} x="0" y="0" width="1" height="1" result="breathMap" />
          <feMerge result="safeBreathMap">
            <feMergeNode in="neutral" />
            <feMergeNode in="breathMap" />
          </feMerge>
          <feDisplacementMap
            in="tail"
            in2="safeBreathMap"
            scale="0"
            xChannelSelector="R"
            yChannelSelector="G"
            data-motion-part="breath"
          >
            {active && (
              <animate
                attributeName="scale"
                values="0;0;0.012;0;0"
                keyTimes="0;0.08;0.34;0.60;1"
                calcMode="spline"
                keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
                dur="10.4s"
                repeatCount="indefinite"
              />
            )}
          </feDisplacementMap>
        </filter>
      </defs>
    </svg>
  );
}
