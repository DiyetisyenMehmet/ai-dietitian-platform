import type { Metadata } from "next";

import { getDashboardData } from "@/application/dashboard/dashboard-data";
import { AppShell } from "@/presentation/components/layout/app-shell";
import { GreetingSection } from "@/presentation/components/dashboard/greeting-section";
import { DailyProgressSection } from "@/presentation/components/dashboard/daily-progress-section";
import { MacrosSection } from "@/presentation/components/dashboard/macros-section";
import { WaterSection } from "@/presentation/components/dashboard/water-section";
import { MealsSection } from "@/presentation/components/dashboard/meals-section";
import { GoalSection } from "@/presentation/components/dashboard/goal-section";
import { AiInsightSection } from "@/presentation/components/dashboard/ai-insight-section";
import { QuickActionsSection } from "@/presentation/components/dashboard/quick-actions-section";
import { WeightSection } from "@/presentation/components/dashboard/weight-section";
import { ActivitySection } from "@/presentation/components/dashboard/activity-section";

export const metadata: Metadata = {
  title: "Ana Sayfa",
};

export default function DashboardPage() {
  const data = getDashboardData();

  return (
    <AppShell title="Ana Sayfa">
      <div className="animate-fade-in space-y-6">
        <GreetingSection userName={data.userName} />
        <DailyProgressSection goal={data.calories.goal} consumed={data.calories.consumed} />
        <MacrosSection macros={data.macros} />
        <WaterSection current={data.water.current} goal={data.water.goal} unit={data.water.unit} />
        <AiInsightSection insight={data.aiInsight} />
        <QuickActionsSection />
        <MealsSection meals={data.meals} />
        <GoalSection goals={data.goals} />
        <WeightSection weight={data.weight} />
        <ActivitySection activity={data.activity} />
      </div>
    </AppShell>
  );
}
