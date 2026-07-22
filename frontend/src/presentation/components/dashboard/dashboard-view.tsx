"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { GreetingSection } from "@/presentation/components/dashboard/greeting-section";
import { CoachHeroSection } from "@/presentation/components/dashboard/coach-hero-section";
import { TodayProgressSection } from "@/presentation/components/dashboard/today-progress-section";
import { DailyJourneySection } from "@/presentation/components/dashboard/daily-journey-section";
import { HealthScoreSection } from "@/presentation/components/dashboard/health-score-section";
import { GoalTrackerSection } from "@/presentation/components/dashboard/goal-tracker-section";
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

      <DailyJourneySection />

      <HealthScoreSection />

      <GoalTrackerSection />

      <TodayProgressSection />

      {rest.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Koçundan</h3>
            <Link
              href="/insights"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Tüm içgörüler
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="space-y-3">
            {rest.map((insight) => (
              <CoachInsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>
      )}

      <Link
        href="/insights"
        className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Koçun İçgörüleri</span>
          <span className="block text-xs text-muted-foreground">
            Haftalık değerlendirme, risk uyarıları ve sana özel öneriler
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </div>
  );
}
