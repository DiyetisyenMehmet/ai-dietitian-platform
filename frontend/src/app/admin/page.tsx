import type { Metadata } from "next";

import { AdminAccessBoundary } from "@/presentation/components/admin/admin-access-boundary";

export const metadata: Metadata = {
  title: "Management Center",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminAccessBoundary />;
}
