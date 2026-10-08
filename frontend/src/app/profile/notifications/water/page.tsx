import type { Metadata } from "next";
import { AppShell } from "@/presentation/components/layout/app-shell";
import { WaterRemindersView } from "@/presentation/components/profile/water-reminders-view";

export const metadata: Metadata = { title: "Su Hatırlatmaları" };

export default function WaterRemindersPage() {
  return (
    <AppShell title="Su hatırlatmaları" showBack hideBottomNav>
      <WaterRemindersView />
    </AppShell>
  );
}
