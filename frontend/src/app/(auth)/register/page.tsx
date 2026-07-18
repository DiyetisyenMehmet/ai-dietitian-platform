"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { registerSchema, type RegisterInput } from "@/domain/auth/validation";
import { authService } from "@/application/auth/auth-service";
import { authStore } from "@/application/auth/auth-store";
import { AuthLayout } from "@/presentation/components/layout/auth-layout";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";
import { Checkbox } from "@/presentation/components/ui/checkbox";
import { Button } from "@/presentation/components/ui/button";

export default function RegisterPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false as unknown as true,
    },
  });

  const acceptTerms = watch("acceptTerms");

  const onSubmit = React.useCallback(
    async (values: RegisterInput) => {
      const result = await authService.register(values);
      if (result.ok) {
        authStore.setSession(result.data);
        toast.success("Aramıza hoş geldiniz! Şimdi profilinizi oluşturalım.");
        router.replace("/onboarding");
        return;
      }
      toast.error(result.error);
    },
    [router],
  );

  return (
    <AuthLayout
      title="Hesap oluşturun"
      subtitle="Sağlıklı yolculuğunuza başlayın"
      footer={
        <>
          Zaten hesabınız var mı?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Giriş yapın
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="fullName" label="Ad Soyad" error={errors.fullName?.message}>
          <Input autoComplete="name" placeholder="Adınız Soyadınız" {...register("fullName")} />
        </FormField>

        <FormField id="email" label="E-posta" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="ornek@eposta.com"
            {...register("email")}
          />
        </FormField>

        <FormField id="password" label="Şifre" error={errors.password?.message}>
          <PasswordInput
            autoComplete="new-password"
            placeholder="En az 8 karakter"
            {...register("password")}
          />
        </FormField>

        <FormField
          id="confirmPassword"
          label="Şifre (Tekrar)"
          error={errors.confirmPassword?.message}
        >
          <PasswordInput
            autoComplete="new-password"
            placeholder="Şifrenizi tekrar girin"
            {...register("confirmPassword")}
          />
        </FormField>

        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={acceptTerms === true}
              onCheckedChange={(checked) =>
                setValue("acceptTerms", (checked === true) as true, { shouldValidate: true })
              }
            />
            <span>
              <Link href="/terms" className="font-medium text-primary hover:underline">
                Kullanım koşullarını
              </Link>{" "}
              ve{" "}
              <Link href="/privacy" className="font-medium text-primary hover:underline">
                gizlilik politikasını
              </Link>{" "}
              kabul ediyorum.
            </span>
          </label>
          {errors.acceptTerms && (
            <p role="alert" className="text-sm text-destructive">
              {errors.acceptTerms.message}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
          {isSubmitting ? "Hesap oluşturuluyor..." : "Hesap Oluştur"}
        </Button>
      </form>
    </AuthLayout>
  );
}
