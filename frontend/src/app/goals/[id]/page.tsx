import { AppShell } from "@/presentation/components/layout/app-shell";
import { GoalDetailsView } from "@/presentation/components/goals/goal-details-view";

export default async function GoalDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppShell title="Hedef Detayı" showBack>
      <GoalDetailsView goalId={id} />
    </AppShell>
  );
}
