"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Leaf } from "lucide-react";
import { toast } from "sonner";

import {
  onboardingFormSchema,
  toOnboardingPayload,
  type OnboardingFormValues,
} from "@/domain/onboarding/validation";
import {
  ACTIVITY_LEVEL_OPTIONS,
  ALLERGY_PRESETS,
  DIETARY_PREFERENCE_OPTIONS,
  GENDER_OPTIONS,
  HEALTH_CONDITION_PRESETS,
  type ActivityLevel,
  type DietaryPreference,
  type Gender,
} from "@/domain/onboarding/types";
import { onboardingService } from "@/application/onboarding/onboarding-service";
import { authStore, useAuth } from "@/application/auth/auth-store";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { Button } from "@/presentation/components/ui/button";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { OptionCards } from "@/presentation/components/onboarding/option-cards";
import { ChipSelect } from "@/presentation/components/onboarding/chip-select";

/** Fields validated when advancing from each step. */
const STEP_FIELDS: (keyof OnboardingFormValues)[][] = [
  ["fullName", "dateOfBirth", "gender"],
  ["heightCm", "currentWeightKg", "targetWeightKg"],
  ["activityLevel"],
  ["healthConditions", "allergies"],
  ["dietaryPreference", "dailyWaterGoalMl"],
];

const STEP_META = [
  { title: "Sizi tanıyalım", subtitle: "Temel bilgilerinizle başlayalım." },
  { title: "Vücut ölçüleriniz", subtitle: "Hedeflerinizi kişiselleştirmemize yardımcı olun." },
  { title: "Aktivite seviyeniz", subtitle: "Günlük hareketliliğinizi seçin." },
  { title: "Sağlık durumunuz", subtitle: "Varsa belirtin — bu adım isteğe bağlıdır." },
  { title: "Beslenme & su", subtitle: "Son birkaç tercih ve hazırsınız." },
];

const TOTAL_STEPS = STEP_META.length;

export function OnboardingWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = React.useState(0);

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    mode: "onTouched",
    defaultValues: {
      fullName: user?.fullName ?? "",
      dateOfBirth: "",
      gender: "" as unknown as Gender,
      heightCm: "",
      currentWeightKg: "",
      targetWeightKg: "",
      activityLevel: "" as unknown as ActivityLevel,
      healthConditions: [],
      allergies: [],
      dietaryPreference: "" as unknown as DietaryPreference,
      dailyWaterGoalMl: "2500",
    },
  });

  const gender = watch("gender");
  const activityLevel = watch("activityLevel");
  const dietaryPreference = watch("dietaryPreference");
  const healthConditions = watch("healthConditions");
  const allergies = watch("allergies");

  const goNext = React.useCallback(async () => {
    const valid = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (!valid) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, [step, trigger]);

  const goBack = React.useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const onSubmit = React.useCallback(
    async (values: OnboardingFormValues) => {
      const result = await onboardingService.complete(toOnboardingPayload(values));
      if (result.ok) {
        authStore.updateUser({
          onboardingCompleted: true,
          fullName: result.data.fullName,
        });
        toast.success("Profiliniz hazır! Diewish'e hoş geldiniz.");
        router.replace("/");
        return;
      }
      toast.error(result.error);
    },
    [router],
  );

  const isLastStep = step === TOTAL_STEPS - 1;
  const meta = STEP_META[step];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto w-full max-w-md px-4 pt-6">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10">
            <Leaf className="size-4 text-primary" aria-hidden="true" />
          </span>
          Diewish
        </div>
        <ProgressBar value={((step + 1) / TOTAL_STEPS) * 100} />
        <p className="mt-2 text-sm text-muted-foreground">
          Adım {step + 1} / {TOTAL_STEPS}
        </p>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="animate-fade-in space-y-5">
          {/* Step 1 — identity */}
          {step === 0 && (
            <>
              <FormField id="fullName" label="Ad Soyad" error={errors.fullName?.message}>
                <Input autoComplete="name" placeholder="Adınız Soyadınız" {...register("fullName")} />
              </FormField>
              <FormField id="dateOfBirth" label="Doğum Tarihi" error={errors.dateOfBirth?.message}>
                <Input type="date" {...register("dateOfBirth")} />
              </FormField>
              <FormField id="gender" label="Cinsiyet" error={errors.gender?.message}>
                <OptionCards
                  ariaLabel="Cinsiyet"
                  columns={2}
                  options={GENDER_OPTIONS}
                  value={gender ?? ""}
                  onChange={(v) => setValue("gender", v, { shouldValidate: true })}
                />
              </FormField>
            </>
          )}

          {/* Step 2 — measurements */}
          {step === 1 && (
            <>
              <FormField id="heightCm" label="Boy (cm)" error={errors.heightCm?.message}>
                <Input type="number" inputMode="decimal" placeholder="172" {...register("heightCm")} />
              </FormField>
              <FormField
                id="currentWeightKg"
                label="Mevcut Kilo (kg)"
                error={errors.currentWeightKg?.message}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="68"
                  {...register("currentWeightKg")}
                />
              </FormField>
              <FormField
                id="targetWeightKg"
                label="Hedef Kilo (kg)"
                error={errors.targetWeightKg?.message}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="62"
                  {...register("targetWeightKg")}
                />
              </FormField>
            </>
          )}

          {/* Step 3 — activity */}
          {step === 2 && (
            <FormField id="activityLevel" label="Aktivite Seviyesi" error={errors.activityLevel?.message}>
              <OptionCards
                ariaLabel="Aktivite seviyesi"
                options={ACTIVITY_LEVEL_OPTIONS}
                value={activityLevel ?? ""}
                onChange={(v) => setValue("activityLevel", v, { shouldValidate: true })}
              />
            </FormField>
          )}

          {/* Step 4 — health */}
          {step === 3 && (
            <>
              <FormField
                id="healthConditions"
                label="Sağlık Durumları (isteğe bağlı)"
                error={errors.healthConditions?.message}
              >
                <ChipSelect
                  ariaLabel="Sağlık durumları"
                  presets={HEALTH_CONDITION_PRESETS}
                  value={healthConditions}
                  onChange={(v) => setValue("healthConditions", v, { shouldValidate: true })}
                  addPlaceholder="Başka bir durum ekleyin"
                />
              </FormField>
              <FormField
                id="allergies"
                label="Alerjiler (isteğe bağlı)"
                error={errors.allergies?.message}
              >
                <ChipSelect
                  ariaLabel="Alerjiler"
                  presets={ALLERGY_PRESETS}
                  value={allergies}
                  onChange={(v) => setValue("allergies", v, { shouldValidate: true })}
                  addPlaceholder="Başka bir alerji ekleyin"
                />
              </FormField>
            </>
          )}

          {/* Step 5 — diet & water */}
          {step === 4 && (
            <>
              <FormField
                id="dietaryPreference"
                label="Beslenme Tercihi"
                error={errors.dietaryPreference?.message}
              >
                <OptionCards
                  ariaLabel="Beslenme tercihi"
                  columns={2}
                  options={DIETARY_PREFERENCE_OPTIONS}
                  value={dietaryPreference ?? ""}
                  onChange={(v) => setValue("dietaryPreference", v, { shouldValidate: true })}
                />
              </FormField>
              <FormField
                id="dailyWaterGoalMl"
                label="Günlük Su Hedefi (ml)"
                error={errors.dailyWaterGoalMl?.message}
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="2500"
                  {...register("dailyWaterGoalMl")}
                />
              </FormField>
            </>
          )}

          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <Button type="button" variant="outline" size="lg" onClick={goBack} className="flex-1">
                <ArrowLeft aria-hidden="true" /> Geri
              </Button>
            )}
            {isLastStep ? (
              <Button type="submit" size="lg" className="flex-1" isLoading={isSubmitting}>
                {isSubmitting ? "Kaydediliyor..." : "Tamamla"}
              </Button>
            ) : (
              <Button type="button" size="lg" className="flex-1" onClick={goNext}>
                Devam <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
