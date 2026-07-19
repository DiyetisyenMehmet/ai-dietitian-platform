import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { ProfileView } from "@/presentation/components/profile/profile-view";

export const metadata: Metadata = {
  title: "Sağlık Profilim",
};

export default function ProfilePage() {
  return (
    <AppShell title="Sağlık Profilim">
      <ProfileView />
    </AppShell>
  );
}
