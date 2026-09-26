import type { Metadata } from "next";

import { AdminAccessBoundary } from "@/presentation/components/admin/admin-access-boundary";

export const metadata: Metadata = {
  title: "İşlem Geçmişi",
  robots: { index: false, follow: false },
};

export default function AdminAuditPage() {
  return <AdminAccessBoundary view="audit" />;
}
