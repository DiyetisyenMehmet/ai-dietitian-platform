import { AppShell } from "@/presentation/components/layout/app-shell";
import { GoalForm } from "@/presentation/components/goals/goal-form";

export default function NewGoalPage() {
  return (
    <AppShell title="Yeni Hedef" showBack hideBottomNav>
      <div className="animate-fade-in">
        <GoalForm mode="create" />
      </div>
    </AppShell>
  );
}
