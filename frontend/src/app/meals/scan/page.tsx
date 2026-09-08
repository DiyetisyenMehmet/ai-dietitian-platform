import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { NutritionScannerView } from "@/presentation/components/meals/nutrition-scanner-view";

export const metadata: Metadata = {
  title: "Besin Tarayıcı",
};

export default function FoodScanPage() {
  return (
    <AppShell title="Besin Tarayıcı" showBack hideBottomNav>
      <div className="animate-fade-in">
        <NutritionScannerView />
      </div>
    </AppShell>
  );
}
