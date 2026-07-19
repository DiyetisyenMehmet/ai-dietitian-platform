"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { FormField } from "@/presentation/components/ui/form-field";
import { SectionCard } from "@/presentation/components/health/section-card";
import { useHealthProfile, healthProfileStore } from "@/application/health/health-profile-store";
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

/** A toggleable chip used for multi-select presets (conditions / allergies). */
function ToggleChip({
  label,
  active,
  onToggle,
  tone = "primary",
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  tone?: "primary" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97]",
        active
          ? tone === "danger"
            ? "border-destructive bg-destructive/10 text-destructive"
            : "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

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

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

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

  const onSubmit = (event: React.FormEvent) => {
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
    healthProfileStore.update({
      fullName: fullName.trim(),
      age: Number(age),
      gender,
      heightCm: Number(heightCm),
      currentWeightKg: nextCurrent,
      targetWeightKg: Number(targetWeightKg),
      activityLevel,
      dietaryPreference,
      dailyCalorieGoal: Number(dailyCalorieGoal),
      dailyWaterGoalMl: Number(dailyWaterGoalMl),
      healthConditions: conditions,
      allergies,
    });
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
    <form onSubmit={onSubmit} className="space-y-6">
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
        <div className="flex flex-wrap gap-2">
          {HEALTH_CONDITION_PRESETS.map((c) => (
            <ToggleChip
              key={c}
              label={c}
              active={conditions.includes(c)}
              onToggle={() => setConditions((prev) => toggle(prev, c))}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard icon="flag" title="Alerjiler">
        <p className="mb-3 text-xs text-muted-foreground">
          Alerjin olan besinleri seç; içerdikleri öğünlerde seni uyarırım.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALLERGY_PRESETS.map((a) => (
            <ToggleChip
              key={a}
              label={a}
              tone="danger"
              active={allergies.includes(a)}
              onToggle={() => setAllergies((prev) => toggle(prev, a))}
            />
          ))}
        </div>
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
