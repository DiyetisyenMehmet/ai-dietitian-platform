import { AppShell } from "@/presentation/components/layout/app-shell";
import { NutritionPlanView } from "@/presentation/components/meals/nutrition-plan-view";

export default function NutritionPlanPage() {
  return (
    <AppShell title="Öğün Planım">
      <div className="animate-fade-in">
        <NutritionPlanView />
      </div>
    </AppShell>
  );
}
