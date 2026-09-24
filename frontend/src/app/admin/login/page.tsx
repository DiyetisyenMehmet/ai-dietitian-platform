"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { authService } from "@/application/auth/auth-service";
import { authStore, useAuth } from "@/application/auth/auth-store";
import { loginSchema, type LoginInput } from "@/domain/auth/validation";
import { Button } from "@/presentation/components/ui/button";
import { Checkbox } from "@/presentation/components/ui/checkbox";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { PasswordInput } from "@/presentation/components/ui/password-input";

export default function AdminLoginPage() {
  const router = useRouter();
  const { status } = useAuth();
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

  React.useEffect(() => {
    if (status === "authenticated") {
      router.replace("/admin");
    }
  }, [router, status]);

  const onSubmit = React.useCallback(
    async (values: LoginInput) => {
      const result = await authService.login(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      authStore.setSession(result.data);
      router.replace("/admin");
    },
    [router],
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-7">
          <div className="flex items-center justify-between gap-4">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold tracking-[0.16em] text-amber-700 dark:text-amber-300">
              STAGING
            </span>
          </div>
          <p className="mt-5 text-sm font-semibold text-primary">DIEWISH</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Management Center
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Yalnızca yetkili yönetici hesapları içindir.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField id="email" label="E-posta" error={errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="yonetici@diewish.com"
              {...register("email")}
            />
          </FormField>

          <FormField id="password" label="Şifre" error={errors.password?.message}>
            <PasswordInput
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password")}
            />
          </FormField>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              checked={rememberMe}
              onCheckedChange={(checked) =>
                setValue("rememberMe", checked === true)
              }
            />
            Beni hatırla
          </label>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            isLoading={isSubmitting}
          >
            {isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          Yetki kontrolü backend üzerinde güncel ADMIN rolü ve RBAC izinleriyle
          doğrulanır.
        </p>
      </section>
    </main>
  );
}
