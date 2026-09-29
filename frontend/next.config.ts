import type { NextConfig } from "next";

/**
 * Security headers applied to every response. These harden the app against
 * common attacks (clickjacking, MIME sniffing, referrer leakage) and are part
 * of the production-readiness requirements for the iyzico merchant review.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Web/PWA barcode scanning uses getUserMedia on the Diewish origin. Keep
  // microphone/geolocation disabled and do not grant camera access to embeds.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// Staging can keep browser/API traffic first-party even when Cloud Run assigns
// separate frontend and backend hosts. This value is server/build-only and is
// intentionally absent in normal builds unless a deployment supplies it.
const apiProxyTarget = process.env.DIEWISH_API_PROXY_TARGET?.trim().replace(/\/+$/, "");

// Temporary visual deployment marker for dashboard QA.
// Because this module is evaluated during the Next.js build, each frontend
// build receives a new immutable timestamp baked into the client bundle.
const diewishBuildStamp = new Date().toISOString();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_DIEWISH_BUILD_STAMP: diewishBuildStamp,
  },
  // Standalone output produces a minimal, self-contained server bundle for Docker.
  output: "standalone",
  // Never leak the framework via the X-Powered-By header.
  poweredByHeader: false,
  // gzip/deflate compression for served assets.
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
