import type { Metadata } from "next";

import { AdminAccessBoundary } from "@/presentation/components/admin/admin-access-boundary";

export const metadata: Metadata = {
  title: "Access & Security",
  robots: { index: false, follow: false },
};

export default function AdminAccessPage() {
  return <AdminAccessBoundary view="access" />;
}
