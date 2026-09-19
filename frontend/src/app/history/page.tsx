import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { HistoryView } from "@/presentation/components/history/history-view";

export const metadata: Metadata = {
  title: "Geçmişim",
};

export default function HistoryPage() {
  return (
    <AppShell title="Geçmişim" showBack>
      <HistoryView />
    </AppShell>
  );
}
