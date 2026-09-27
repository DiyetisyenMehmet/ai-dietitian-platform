import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { ScanHistoryView } from "@/presentation/components/meals/scan-history-view";

export const metadata: Metadata = {
  title: "Tarama Geçmişi",
};

export default function ScanHistoryPage() {
  return (
    <AppShell title="Tarama Geçmişi" showBack hideBottomNav>
      <div className="animate-fade-in">
        <ScanHistoryView />
      </div>
    </AppShell>
  );
}
