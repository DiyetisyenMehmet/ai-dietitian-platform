"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { loginSchema, type LoginInput } from "@/domain/auth/validation";
import { authService } from "@/application/auth/auth-service";
import { AuthLayout } from "@/presentation/components/layout/auth-layout";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";
import { Checkbox } from "@/presentation/components/ui/checkbox";
import { Button } from "@/presentation/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const rememberMe = watch("rememberMe");

  const onSubmit = React.useCallback(
    async (values: LoginInput) => {
      const result = await authService.login(values);
      if (result.ok) {
        toast.success("Giriş başarılı. Yönlendiriliyorsunuz...");
        router.push("/");
        return;
      }
      toast.error(result.error);
    },
    [router],
  );

  return (
    <AuthLayout
      title="Tekrar hoş geldiniz"
      subtitle="Hesabınıza giriş yapın"
      footer={
        <>
          Hesabınız yok mu?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Kayıt olun
          </Link>
        </>
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

        <FormField
          id="password"
          label="Şifre"
          error={errors.password?.message}
          labelAction={
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Şifremi unuttum
            </Link>
          }
        >
          <PasswordInput
            autoComplete="current-password"
            placeholder="••••••••"
            {...register("password")}
          />
        </FormField>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox
            checked={rememberMe}
            onCheckedChange={(checked) => setValue("rememberMe", checked === true)}
          />
          Beni hatırla
        </label>

        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
          {isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}
        </Button>
      </form>
    </AuthLayout>
  );
}
