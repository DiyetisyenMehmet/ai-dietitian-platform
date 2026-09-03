import { AppShell } from "@/presentation/components/layout/app-shell";
import { ActivityView } from "@/presentation/components/activity/activity-view";

export default function ActivityPage() {
  return (
    <AppShell title="Hareket">
      <ActivityView />
    </AppShell>
  );
}
