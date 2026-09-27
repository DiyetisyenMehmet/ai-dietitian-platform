import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { NutritionPlanHistoryView } from "@/presentation/components/meals/nutrition-plan-history-view";

export const metadata: Metadata = {
  title: "Plan Geçmişi",
};

export default function NutritionPlanHistoryPage() {
  return (
    <AppShell title="Plan Geçmişi" showBack hideBottomNav>
      <div className="animate-fade-in">
        <NutritionPlanHistoryView />
      </div>
    </AppShell>
  );
}
