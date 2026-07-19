import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { FoodScannerView } from "@/presentation/components/meals/food-scanner-view";

export const metadata: Metadata = {
  title: "Besin Tarayıcı",
};

export default function FoodScanPage() {
  return (
    <AppShell title="Besin Tarayıcı" showBack hideBottomNav>
      <div className="animate-fade-in">
        <FoodScannerView />
      </div>
    </AppShell>
  );
}
