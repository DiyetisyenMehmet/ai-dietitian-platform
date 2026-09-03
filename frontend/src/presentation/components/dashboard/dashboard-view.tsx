"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { GreetingSection } from "@/presentation/components/dashboard/greeting-section";
import { TodayActionsSection } from "@/presentation/components/dashboard/today-actions-section";
import { CoachHeroSection } from "@/presentation/components/dashboard/coach-hero-section";
import { TodayProgressSection } from "@/presentation/components/dashboard/today-progress-section";
import { CoachInsightCard } from "@/presentation/components/health/coach-insight-card";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { useCoachInsights } from "@/application/health/coach";

/**
 * Calm, action-first home screen. Detailed scores, weight trends, activity and
 * history do not compete for attention here; the dashboard answers only
 * "what can I do today?" and routes deeper analysis to its dedicated screens.
 */
export function DashboardView() {
  const profile = useHealthProfile();
  const insights = useCoachInsights(3);
  const secondaryInsights = insights.slice(1, 3);

  return (
    <div className="animate-fade-in space-y-6">
      <GreetingSection userName={profile.fullName} />

      <TodayActionsSection />

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
  );
}
