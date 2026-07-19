import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { DashboardView } from "@/presentation/components/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Ana Sayfa",
};

export default function DashboardPage() {
  return (
    <AppShell title="Ana Sayfa">
      <DashboardView />
    </AppShell>
  );
}
