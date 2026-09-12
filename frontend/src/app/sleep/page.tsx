import { AppShell } from "@/presentation/components/layout/app-shell";
import { SleepView } from "@/presentation/components/sleep/sleep-view";

export default function SleepPage() {
  return (
    <AppShell title="Uyku">
      <SleepView />
    </AppShell>
  );
}
