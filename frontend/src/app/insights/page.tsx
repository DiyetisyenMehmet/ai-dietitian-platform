import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { InsightsView } from "@/presentation/components/health/insights-view";

export const metadata: Metadata = {
  title: "İçgörüler",
};

export default function InsightsPage() {
  return (
    <AppShell title="İçgörüler">
      <InsightsView />
    </AppShell>
  );
}
