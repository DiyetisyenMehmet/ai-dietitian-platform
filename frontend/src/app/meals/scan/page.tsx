import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { NutritionScannerView } from "@/presentation/components/meals/nutrition-scanner-view";

export const metadata: Metadata = {
  title: "Besin Tarayıcı",
};

export default async function FoodScanPage({ searchParams }: { searchParams: Promise<{ journey?: string }> }) {
  const { journey } = await searchParams;
  return (
    <AppShell title="Besin Tarayıcı" showBack hideBottomNav>
      <div className="animate-fade-in">
        <NutritionScannerView journeyToken={journey} />
      </div>
    </AppShell>
  );
}
