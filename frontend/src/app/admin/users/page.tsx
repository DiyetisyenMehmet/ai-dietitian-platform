import { AdminAccessBoundary } from "@/presentation/components/admin/admin-access-boundary";
export const metadata = { title: "Kullanıcılar", robots: { index: false, follow: false } };
export default function Page() {
  return <AdminAccessBoundary view="users" />;
}
