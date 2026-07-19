"use client";

import * as React from "react";

import { GreetingSection } from "@/presentation/components/dashboard/greeting-section";
import { TodayProgressSection } from "@/presentation/components/dashboard/today-progress-section";
import { TodayTasksSection } from "@/presentation/components/dashboard/today-tasks-section";
import { QuickActionsSection } from "@/presentation/components/dashboard/quick-actions-section";
import { AiInsightSection } from "@/presentation/components/dashboard/ai-insight-section";
import { CoachInsightCard } from "@/presentation/components/health/coach-insight-card";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { useCoachInsights } from "@/application/health/coach";
import { getDashboardData } from "@/application/dashboard/dashboard-data";

/**
 * The guided dashboard "journey": a single, prioritized flow that answers
 * "what should I do now?" rather than a wall of cards. Everything is derived
 * from the shared in-memory stores so it reacts to real session activity.
 */
export function DashboardView() {
  const profile = useHealthProfile();
  const insights = useCoachInsights(4);
  const aiInsight = React.useMemo(() => getDashboardData().aiInsight, []);

  const hero = insights[0];
  const rest = insights.slice(1);

  return (
    <div className="animate-fade-in space-y-6">
      <GreetingSection userName={profile.fullName} />

      {hero && (
        <section aria-label="Sıradaki adım">
          <CoachInsightCard insight={hero} variant="hero" />
        </section>
      )}

      <TodayProgressSection />

      <TodayTasksSection />

      <QuickActionsSection />

      {rest.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold">Koçundan</h3>
          <div className="space-y-3">
            {rest.map((insight) => (
              <CoachInsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Son Koç Tavsiyesi</h3>
        <AiInsightSection insight={aiInsight} />
      </section>
    </div>
  );
}
