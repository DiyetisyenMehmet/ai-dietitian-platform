import type { MetadataRoute } from "next";

import { SITE_URL } from "@/shared/constants/site";

/**
 * robots.txt — allow crawling of public marketing pages while keeping
 * authenticated app areas out of search indexes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/ai",
        "/meals",
        "/goals",
        "/onboarding",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
