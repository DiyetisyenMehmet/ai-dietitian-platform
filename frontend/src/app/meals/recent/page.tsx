import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { RecentMealsView } from "@/presentation/components/meals/recent-meals-view";

export const metadata: Metadata = {
  title: "Son Yediklerim",
};

export default function RecentMealsPage() {
  return (
    <AppShell title="Son Yediklerim" showBack hideBottomNav>
      <div className="animate-fade-in">
        <RecentMealsView />
      </div>
    </AppShell>
  );
}
