import type { Metadata } from "next";
import { AppShell } from "@/presentation/components/layout/app-shell";
import { MascotPreferencesView } from "@/presentation/components/profile/mascot-preferences-view";
export const metadata: Metadata = { title: "Maskot Tercihleri" };
export default function MascotPage() {
  return (
    <AppShell title="Maskot Tercihleri" showBack hideBottomNav>
      <MascotPreferencesView />
    </AppShell>
  );
}
