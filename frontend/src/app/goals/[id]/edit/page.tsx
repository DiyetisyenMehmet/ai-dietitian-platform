import { AppShell } from "@/presentation/components/layout/app-shell";
import { GoalEditView } from "@/presentation/components/goals/goal-edit-view";

export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppShell title="Hedefi Düzenle" showBack hideBottomNav>
      <div className="animate-fade-in">
        <GoalEditView goalId={id} />
      </div>
    </AppShell>
  );
}
