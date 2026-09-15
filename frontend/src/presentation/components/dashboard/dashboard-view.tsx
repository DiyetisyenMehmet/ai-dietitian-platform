"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

import { useAuth } from "@/application/auth/auth-store";
import { useCoachInsights } from "@/application/health/coach";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { DashboardAiBanner } from "@/presentation/components/dashboard/dashboard-ai-banner";
import { DashboardFeatureLinks } from "@/presentation/components/dashboard/dashboard-feature-links";
import { DashboardHomeHeader } from "@/presentation/components/dashboard/dashboard-home-header";
import { DashboardMetricsSection } from "@/presentation/components/dashboard/dashboard-metrics-section";
import { DashboardQuickActions } from "@/presentation/components/dashboard/dashboard-quick-actions";
import { CoachHeroSection } from "@/presentation/components/dashboard/coach-hero-section";
import { TodayProgressSection } from "@/presentation/components/dashboard/today-progress-section";
import { CoachInsightCard } from "@/presentation/components/health/coach-insight-card";

/**
 * Home is intentionally presentation-only: it composes existing persisted data
 * and existing routes without changing the domain, auth, navigation or tracking contracts.
 */
export function DashboardView() {
  const profile = useHealthProfile();
  const { user } = useAuth();
  const insights = useCoachInsights(3);
  const secondaryInsights = insights.slice(1, 3);
  const [showDetails, setShowDetails] = React.useState(false);
  const displayName = profile.fullName || user?.fullName || "Diewish";

  return (
    <div className="animate-fade-in space-y-5">
      <DashboardHomeHeader userName={displayName} />
      <DashboardMetricsSection />
      <DashboardQuickActions />
      <DashboardFeatureLinks />
      <DashboardAiBanner />

      <section className="border-t border-border/70 pt-2" aria-label="Detaylı günlük takip">
        <button
          type="button"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((current) => !current)}
          className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold text-muted-foreground transition hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>{showDetails ? "Detaylı günlük takibi gizle" : "Detaylı günlük takibi göster"}</span>
          {showDetails ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        </button>

        {showDetails && (
          <div className="animate-fade-in space-y-6 pt-4">
            <CoachHeroSection />
            <TodayProgressSection />

            {secondaryInsights.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Koçundan notlar</h3>
                  <Link
                    href="/insights"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Tümünü gör
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {secondaryInsights.map((insight) => (
                    <CoachInsightCard key={insight.id} insight={insight} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
