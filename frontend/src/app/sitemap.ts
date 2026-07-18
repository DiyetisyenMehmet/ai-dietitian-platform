import type { MetadataRoute } from "next";

import { MARKETING_ROUTES, SITE_URL } from "@/shared/constants/site";

/**
 * sitemap.xml — lists all public marketing routes for search engines. Priority
 * favors the landing and pricing pages; legal pages are included but ranked low.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const priorityFor = (route: string): number => {
    if (route === "/") return 1;
    if (route === "/pricing" || route === "/features") return 0.9;
    if (route === "/faq" || route === "/about" || route === "/contact") return 0.7;
    return 0.4;
  };

  const changeFrequencyFor = (route: string): "weekly" | "monthly" | "yearly" => {
    if (route === "/" || route === "/pricing") return "weekly";
    if (["/privacy", "/terms", "/cookies", "/kvkk"].includes(route)) return "yearly";
    return "monthly";
  };

  return MARKETING_ROUTES.map((route) => ({
    url: `${SITE_URL}${route === "/" ? "" : route}`,
    lastModified,
    changeFrequency: changeFrequencyFor(route),
    priority: priorityFor(route),
  }));
}
