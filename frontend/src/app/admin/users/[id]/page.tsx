import { AdminAccessBoundary } from "@/presentation/components/admin/admin-access-boundary";
export const metadata = { title: "Kullanıcı detayı", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminAccessBoundary view="users" userId={id} />;
}
