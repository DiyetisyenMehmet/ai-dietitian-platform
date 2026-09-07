import { AppShell } from "@/presentation/components/layout/app-shell";
import { NutritionPlanExperience } from "@/presentation/components/meals/nutrition-plan-experience";

export default function NutritionPlanPage() {
  return (
    <AppShell title="Öğün Planım">
      <div className="animate-fade-in">
        <NutritionPlanExperience />
      </div>
    </AppShell>
  );
}
