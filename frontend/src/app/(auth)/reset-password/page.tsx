"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { resetPasswordSchema, type ResetPasswordInput } from "@/domain/auth/validation";
import { authService } from "@/application/auth/auth-service";
import { AuthLayout } from "@/presentation/components/layout/auth-layout";
import { FormField } from "@/presentation/components/ui/form-field";
import { PasswordInput } from "@/presentation/components/ui/password-input";
import { Button } from "@/presentation/components/ui/button";
import { ErrorState } from "@/presentation/components/feedback/error-state";
import { Loading } from "@/presentation/components/feedback/loading";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = React.useCallback(
    async (values: ResetPasswordInput) => {
      if (!token) return;
      const result = await authService.resetPassword(token, values);
      if (result.ok) {
        toast.success("Şifreniz güncellendi! Şimdi giriş yapabilirsiniz.");
        router.push("/login");
        return;
      }
      toast.error(result.error);
    },
    [router, token],
  );

  if (!token) {
    return (
      <AuthLayout title="Geçersiz bağlantı">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <ErrorState
            title="Sıfırlama bağlantısı geçersiz"
            message="Bağlantı eksik veya süresi dolmuş. Lütfen yeni bir sıfırlama bağlantısı isteyin."
          />
          <Button asChild variant="outline" className="w-full">
            <Link href="/forgot-password">Yeni bağlantı iste</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Yeni şifre belirleyin" subtitle="Hesabınız için güçlü bir şifre oluşturun">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="password" label="Yeni Şifre" error={errors.password?.message}>
          <PasswordInput
            autoComplete="new-password"
            placeholder="En az 8 karakter"
            {...register("password")}
          />
        </FormField>
        <FormField
          id="confirmPassword"
          label="Yeni Şifre (Tekrar)"
          error={errors.confirmPassword?.message}
        >
          <PasswordInput
            autoComplete="new-password"
            placeholder="Şifrenizi tekrar girin"
            {...register("confirmPassword")}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
          {isSubmitting ? "Güncelleniyor..." : "Şifreyi Güncelle"}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<Loading />}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}
