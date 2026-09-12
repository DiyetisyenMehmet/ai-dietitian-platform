"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, LockKeyhole, UserRound } from "lucide-react";

import { authStore, useAuth } from "@/application/auth/auth-store";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

export default function GuestPage() {
  const router = useRouter();
  const auth = useAuth();

  const leaveGuest = (destination: string) => {
    authStore.clear();
    router.push(destination);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-4 py-8">
      <div className="space-y-2 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UserRound className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold">Misafir modu</h1>
        <p className="text-sm text-muted-foreground">
          Diewish’i hesap oluşturmadan inceleyebilirsiniz. Sağlık verileri ve kişisel kayıtlar misafir modunda kapalıdır.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex gap-3">
            <Eye className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">Sınırlı keşif</p>
              <p className="text-sm text-muted-foreground">Genel ürün deneyimini ve herkese açık içerikleri inceleyebilirsiniz.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">Sağlık verileri korunur</p>
              <p className="text-sm text-muted-foreground">
                Kan tahlili, beslenme kaydı, AI kişiselleştirme ve diğer özel API’ler kayıtlı hesap gerektirir.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {auth.status === "authenticated" && auth.user?.isGuest ? (
          <Button asChild className="w-full">
            <Link href="/guest/convert">Misafir hesabımı kalıcı hesaba dönüştür</Link>
          </Button>
        ) : (
          <Button type="button" className="w-full" onClick={() => leaveGuest("/register")}>
            Ücretsiz hesap oluştur
          </Button>
        )}
        <Button type="button" variant="outline" className="w-full" onClick={() => leaveGuest("/login")}>
          Mevcut hesaba giriş yap
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/">Ana sayfaya dön</Link>
        </Button>
      </div>

      {auth.status === "authenticated" && !auth.user?.isGuest && (
        <p className="text-center text-xs text-muted-foreground">Bu oturum artık kayıtlı bir hesaba ait.</p>
      )}
    </main>
  );
}
