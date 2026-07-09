"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, MailCheck } from "lucide-react";

import { authService } from "@/application/auth/auth-service";
import { AuthLayout } from "@/presentation/components/layout/auth-layout";
import { Button } from "@/presentation/components/ui/button";
import { Loading } from "@/presentation/components/feedback/loading";
import { ErrorState } from "@/presentation/components/feedback/error-state";

type VerifyStatus = "idle" | "verifying" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = React.useState<VerifyStatus>(token ? "verifying" : "idle");
  const [errorMessage, setErrorMessage] = React.useState<string>();

  const verify = React.useCallback(async () => {
    if (!token) return;
    setStatus("verifying");
    const result = await authService.verifyEmail(token);
    if (result.ok) {
      setStatus("success");
    } else {
      setErrorMessage(result.error);
      setStatus("error");
    }
  }, [token]);

  React.useEffect(() => {
    if (token) void verify();
  }, [token, verify]);

  // No token: instruct the user to check their inbox.
  if (status === "idle") {
    return (
      <AuthLayout
        title="E-postanızı doğrulayın"
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Giriş ekranına dön
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="size-7 text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            Size bir doğrulama bağlantısı gönderdik. Hesabınızı etkinleştirmek için e-postanızdaki
            bağlantıya tıklayın.
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (status === "verifying") {
    return (
      <AuthLayout title="Doğrulanıyor">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <Loading label="E-postanız doğrulanıyor..." />
        </div>
      </AuthLayout>
    );
  }

  if (status === "error") {
    return (
      <AuthLayout title="Doğrulama başarısız">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <ErrorState
            title="E-posta doğrulanamadı"
            message={errorMessage ?? "Bağlantı geçersiz veya süresi dolmuş olabilir."}
            onRetry={verify}
          />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="E-posta doğrulandı"
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Giriş ekranına dön
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-card">
        <div className="flex size-14 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="size-7 text-success" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">
          E-posta adresiniz başarıyla doğrulandı. Artık hesabınıza giriş yapabilirsiniz.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Giriş Yap</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense fallback={<Loading />}>
      <VerifyEmailContent />
    </React.Suspense>
  );
}
