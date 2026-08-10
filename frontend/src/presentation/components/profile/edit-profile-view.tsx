"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { FormField } from "@/presentation/components/ui/form-field";
import { SectionCard } from "@/presentation/components/health/section-card";
import { ChipSelect } from "@/presentation/components/onboarding/chip-select";
import { useHealthProfile, healthProfileStore } from "@/application/health/health-profile-store";
import {
  hydrateStoresFromProfile,
  ageToDateOfBirth,
} from "@/application/health/profile-hydration";
import { onboardingService } from "@/application/onboarding/onboarding-service";
import { authStore } from "@/application/auth/auth-store";
import { journeyStore } from "@/application/health/journey-store";
import {
  ACTIVITY_LEVEL_OPTIONS,
  DIETARY_PREFERENCE_OPTIONS,
  GENDER_OPTIONS,
  HEALTH_CONDITION_PRESETS,
  ALLERGY_PRESETS,
  type ActivityLevel,
  type DietaryPreference,
  type Gender,
} from "@/domain/onboarding/types";
import type { OnboardingPayload } from "@/domain/onboarding/validation";

const selectClass =
  "flex h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** The editable health-data form. Persists to the in-memory health profile. */
export function EditProfileView() {
  const router = useRouter();
  const profile = useHealthProfile();

  const [fullName, setFullName] = React.useState(profile.fullName);
  const [age, setAge] = React.useState(String(profile.age));
  const [gender, setGender] = React.useState<Gender>(profile.gender);
  const [heightCm, setHeightCm] = React.useState(String(profile.heightCm));
  const [currentWeightKg, setCurrentWeightKg] = React.useState(String(profile.currentWeightKg));
  const [targetWeightKg, setTargetWeightKg] = React.useState(String(profile.targetWeightKg));
  const [activityLevel, setActivityLevel] = React.useState<ActivityLevel>(profile.activityLevel);
  const [dietaryPreference, setDietaryPreference] = React.useState<DietaryPreference>(
    profile.dietaryPreference,
  );
  const [dailyCalorieGoal, setDailyCalorieGoal] = React.useState(String(profile.dailyCalorieGoal));
  const [dailyWaterGoalMl, setDailyWaterGoalMl] = React.useState(String(profile.dailyWaterGoalMl));
  const [conditions, setConditions] = React.useState<string[]>(profile.healthConditions);
  const [allergies, setAllergies] = React.useState<string[]>(profile.allergies);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    const ageNum = Number(age);
    const heightNum = Number(heightCm);
    const currentNum = Number(currentWeightKg);
    const targetNum = Number(targetWeightKg);
    const calNum = Number(dailyCalorieGoal);
    const waterNum = Number(dailyWaterGoalMl);
    if (!fullName.trim()) e.fullName = "Ad boş olamaz.";
    if (!Number.isFinite(ageNum) || ageNum < 13 || ageNum > 120) e.age = "Geçerli bir yaş gir (13-120).";
    if (!Number.isFinite(heightNum) || heightNum < 100 || heightNum > 250)
      e.heightCm = "Boy 100-250 cm arasında olmalı.";
    if (!Number.isFinite(currentNum) || currentNum < 30 || currentNum > 400)
      e.currentWeightKg = "Kilo 30-400 kg arasında olmalı.";
    if (!Number.isFinite(targetNum) || targetNum < 30 || targetNum > 400)
      e.targetWeightKg = "Hedef kilo 30-400 kg arasında olmalı.";
    if (!Number.isFinite(calNum) || calNum < 800 || calNum > 6000)
      e.dailyCalorieGoal = "Kalori 800-6000 arasında olmalı.";
    if (!Number.isFinite(waterNum) || waterNum < 500 || waterNum > 6000)
      e.dailyWaterGoalMl = "Su hedefi 500-6000 ml arasında olmalı.";
    return e;
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Lütfen işaretli alanları düzelt.");
      return;
    }
    setSaving(true);
    const nextCurrent = Number(currentWeightKg);
    const weightChanged = nextCurrent !== profile.currentWeightKg;

    // Persist to the backend first (reusing the idempotent onboarding upsert
    // endpoint — no new endpoint / contract). The stores are only refreshed
    // AFTER a successful response, from the backend's own data, so they never
    // become their own source of truth. Custom diseases/allergies flow through
    // the `conditions`/`allergies` state verbatim so free-text "other" entries
    // persist (21.2 medical-profile single-source-of-truth requirement).
    const payload: OnboardingPayload = {
      fullName: fullName.trim(),
      dateOfBirth: ageToDateOfBirth(Number(age)),
      gender,
      heightCm: Number(heightCm),
      currentWeightKg: nextCurrent,
      targetWeightKg: Number(targetWeightKg),
      activityLevel,
      healthConditions: conditions,
      allergies,
      dietaryPreference,
      dailyWaterGoalMl: Number(dailyWaterGoalMl),
    };
    const result = await onboardingService.complete(payload);
    if (!result.ok) {
      toast.error(result.error);
      setSaving(false);
      return;
    }

    authStore.updateUser({ fullName: result.data.fullName });
    hydrateStoresFromProfile(result.data.profile, result.data.fullName);
    // Daily calorie goal is a client-only preference (not part of the backend
    // profile contract); apply the user's edit locally after hydration.
    healthProfileStore.update({ dailyCalorieGoal: Number(dailyCalorieGoal) });

    if (weightChanged) {
      journeyStore.add({
        type: "weight-updated",
        title: "Profil güncellendi",
        description: `Güncel kilo ${nextCurrent.toFixed(1)} kg olarak kaydedildi.`,
      });
    }
    toast.success("Sağlık bilgilerin güncellendi.");
    setSaving(false);
    router.push("/profile");
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
      <SectionCard icon="user" title="Kişisel Bilgiler">
        <div className="space-y-4">
          <FormField id="fullName" label="Ad Soyad" error={errors.fullName}>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="age" label="Yaş" error={errors.age}>
              <Input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
            </FormField>
            <FormField id="gender" label="Cinsiyet">
              <select
                className={selectClass}
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
              >
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField id="heightCm" label="Boy (cm)" error={errors.heightCm}>
            <Input type="number" inputMode="numeric" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard icon="target" title="Kilo Hedefleri">
        <div className="grid grid-cols-2 gap-3">
          <FormField id="currentWeightKg" label="Güncel kilo (kg)" error={errors.currentWeightKg}>
            <Input type="number" inputMode="decimal" step="0.1" value={currentWeightKg} onChange={(e) => setCurrentWeightKg(e.target.value)} />
          </FormField>
          <FormField id="targetWeightKg" label="Hedef kilo (kg)" error={errors.targetWeightKg}>
            <Input type="number" inputMode="decimal" step="0.1" value={targetWeightKg} onChange={(e) => setTargetWeightKg(e.target.value)} />
          </FormField>
          <FormField id="dailyCalorieGoal" label="Günlük kalori (kcal)" error={errors.dailyCalorieGoal}>
            <Input type="number" inputMode="numeric" value={dailyCalorieGoal} onChange={(e) => setDailyCalorieGoal(e.target.value)} />
          </FormField>
          <FormField id="dailyWaterGoalMl" label="Günlük su (ml)" error={errors.dailyWaterGoalMl}>
            <Input type="number" inputMode="numeric" value={dailyWaterGoalMl} onChange={(e) => setDailyWaterGoalMl(e.target.value)} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard icon="activity" title="Aktivite Düzeyi">
        <select
          className={selectClass}
          value={activityLevel}
          onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
        >
          {ACTIVITY_LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.description ? ` — ${o.description}` : ""}
            </option>
          ))}
        </select>
      </SectionCard>

      <SectionCard icon="utensils" title="Beslenme Tercihi">
        <select
          className={selectClass}
          value={dietaryPreference}
          onChange={(e) => setDietaryPreference(e.target.value as DietaryPreference)}
        >
          {DIETARY_PREFERENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.description ? ` — ${o.description}` : ""}
            </option>
          ))}
        </select>
      </SectionCard>

      <SectionCard icon="heart" title="Sağlık Durumu">
        <p className="mb-3 text-xs text-muted-foreground">
          Sana uygun olanları seç. Bu bilgiler önerilerini kişiselleştirmemi sağlar.
        </p>
        {/* Same preset set (HEALTH_CONDITION_PRESETS) and same component used in
            onboarding, so diseases stay perfectly in sync between the two flows.
            ChipSelect also supports free-text "other" conditions, so custom
            diseases entered during onboarding remain visible, editable and are
            never silently dropped on save. */}
        <ChipSelect
          ariaLabel="Sağlık durumları"
          presets={HEALTH_CONDITION_PRESETS}
          value={conditions}
          onChange={setConditions}
          addPlaceholder="Başka bir durum ekleyin"
        />
      </SectionCard>

      <SectionCard icon="flag" title="Alerjiler">
        <p className="mb-3 text-xs text-muted-foreground">
          Alerjin olan besinleri seç; içerdikleri öğünlerde seni uyarırım.
        </p>
        {/* Same preset set (ALLERGY_PRESETS) and same component as onboarding, so
            allergies stay in sync, and custom "other" allergies are preserved. */}
        <ChipSelect
          ariaLabel="Alerjiler"
          presets={ALLERGY_PRESETS}
          value={allergies}
          onChange={setAllergies}
          addPlaceholder="Başka bir alerji ekleyin"
        />
      </SectionCard>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={() => router.push("/profile")}>
          Vazgeç
        </Button>
        <Button type="submit" className="flex-1" isLoading={saving}>
          Kaydet
        </Button>
      </div>
    </form>
  );
}
