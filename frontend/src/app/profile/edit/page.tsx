import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { EditProfileView } from "@/presentation/components/profile/edit-profile-view";

export const metadata: Metadata = {
  title: "Profili Düzenle",
};

export default function EditProfilePage() {
  return (
    <AppShell title="Profili Düzenle" showBack hideBottomNav>
      <div className="animate-fade-in">
        <EditProfileView />
      </div>
    </AppShell>
  );
}
