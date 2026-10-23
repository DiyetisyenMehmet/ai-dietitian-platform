import { AdminAccessBoundary } from "@/presentation/components/admin/admin-access-boundary";
export const metadata = { title: "Sistem Durumu", robots: { index: false, follow: false } };
export default function Page() {
  return <AdminAccessBoundary view="system" />;
}
