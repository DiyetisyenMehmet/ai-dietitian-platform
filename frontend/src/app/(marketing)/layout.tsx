import * as React from "react";

import { SiteHeader } from "@/presentation/components/marketing/site-header";
import { SiteFooter } from "@/presentation/components/marketing/site-footer";

/**
 * Shared chrome for all public marketing pages: sticky site header and footer
 * wrapping the routed page content. These routes render server-side (the
 * RouteGuard exempts them) so they are fully crawlable and reviewable.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
