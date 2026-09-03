"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { GreetingSection } from "@/presentation/components/dashboard/greeting-section";
import { TodayActionsSection } from "@/presentation/components/dashboard/today-actions-section";
import { CoachHeroSection } from "@/presentation/components/dashboard/coach-hero-section";
import { TodayProgressSection } from "@/presentation/components/dashboard/today-progress-section";
import { HealthScoreSection } from "@/presentation/components/dashboard/health-score-section";
import { CoachInsightCard } from "@/presentation/components/health/coach-insight-card";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { useCoachInsights } from "@/application/health/coach";

/**
 * Calm, action-first home screen. The dashboard intentionally does NOT repeat
 * every feature in Diewish: detailed weight/activity/history belongs under
 * Progress, while the home answers only "what can I do today?".
 */
export function DashboardView() {
  const profile = useHealthProfile();
  const insights = useCoachInsights(3);
  // The primary insight is already represented by CoachHeroSection. Surface at
  // most two additional items so the user is not buried in recommendations.
  const secondaryInsights = insights.slice(1, 3);

  return (
    <div className="animate-fade-in space-y-6">
      <GreetingSection userName={profile.fullName} />

      <TodayActionsSection />

      <CoachHeroSection />

      <TodayProgressSection />

      <HealthScoreSection />

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
