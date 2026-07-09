"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { forgotPasswordSchema, type ForgotPasswordInput } from "@/domain/auth/validation";
import { authService } from "@/application/auth/auth-service";
import { AuthLayout } from "@/presentation/components/layout/auth-layout";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { Button } from "@/presentation/components/ui/button";

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = React.useCallback(async (values: ForgotPasswordInput) => {
    const result = await authService.forgotPassword(values);
    if (result.ok) {
      setSentTo(values.email);
      toast.success("Sıfırlama bağlantısı gönderildi.");
      return;
    }
    toast.error(result.error);
  }, []);

  if (sentTo) {
    return (
      <AuthLayout
        title="E-postanızı kontrol edin"
        footer={
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Giriş ekranına dön
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="size-7 text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{sentTo}</span> adresine bir şifre
            sıfırlama bağlantısı gönderdik. Gelen kutunuzu ve spam klasörünü kontrol edin.
          </p>
          <Button variant="outline" className="w-full" onClick={() => onSubmit(getValues())}>
            Tekrar gönder
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Şifrenizi mi unuttunuz?"
      subtitle="E-posta adresinizi girin, size bir sıfırlama bağlantısı gönderelim"
      footer={
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Giriş ekranına dön
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="email" label="E-posta" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="ornek@eposta.com"
            {...register("email")}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
          {isSubmitting ? "Gönderiliyor..." : "Sıfırlama Bağlantısı Gönder"}
        </Button>
      </form>
    </AuthLayout>
  );
}
