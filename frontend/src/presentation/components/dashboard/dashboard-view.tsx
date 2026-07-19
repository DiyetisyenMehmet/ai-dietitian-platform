"use client";

import * as React from "react";

import { GreetingSection } from "@/presentation/components/dashboard/greeting-section";
import { CoachHeroSection } from "@/presentation/components/dashboard/coach-hero-section";
import { TodayProgressSection } from "@/presentation/components/dashboard/today-progress-section";
import { TodayTasksSection } from "@/presentation/components/dashboard/today-tasks-section";
import { CoachInsightCard } from "@/presentation/components/health/coach-insight-card";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { useCoachInsights } from "@/application/health/coach";

/**
 * The guided dashboard — a personal AI health "control center" that answers
 * "what should I do today?". It leads with the AI-coach hero (status + today's
 * priority + one large action), then daily progress, today's tasks and any
 * remaining coach insights. Navigation lives in the bottom bar, so there is no
 * duplicated "quick actions" grid here.
 */
export function DashboardView() {
  const profile = useHealthProfile();
  const insights = useCoachInsights(4);

  // The top insight powers the hero CTA; the rest render as coach cards.
  const rest = insights.slice(1);

  return (
    <div className="animate-fade-in space-y-6">
      <GreetingSection userName={profile.fullName} />

      <CoachHeroSection />

      <TodayProgressSection />

      <TodayTasksSection />

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
    </div>
  );
}
