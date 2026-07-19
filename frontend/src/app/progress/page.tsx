import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { ProgressView } from "@/presentation/components/progress/progress-view";

export const metadata: Metadata = {
  title: "İlerleme",
};

export default function ProgressPage() {
  return (
    <AppShell title="İlerleme">
      <ProgressView />
    </AppShell>
  );
}
