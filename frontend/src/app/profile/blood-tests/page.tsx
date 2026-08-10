import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { BloodTestsView } from "@/presentation/components/health/blood-tests-view";

export const metadata: Metadata = {
  title: "Kan Tahlilleri",
};

export default function BloodTestsPage() {
  return (
    <AppShell title="Kan Tahlilleri" showBack hideBottomNav>
      <div className="animate-fade-in">
        <BloodTestsView />
      </div>
    </AppShell>
  );
}
