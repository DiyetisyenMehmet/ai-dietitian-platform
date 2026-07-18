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
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
};

export default nextConfig;
