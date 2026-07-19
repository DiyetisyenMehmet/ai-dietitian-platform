"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight, Upload } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate, formatNumber } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import {
  SectionCard,
  InfoGrid,
  InfoItem,
  ChipList,
} from "@/presentation/components/health/section-card";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useHealthProfile, useAchievements } from "@/application/health/health-profile-store";
import { useWeightEntries, analyzeWeight } from "@/application/health/weight-store";
import { useBloodTests } from "@/application/health/blood-test-store";
import { genderLabel, activityLabel, dietaryLabel } from "@/application/health/labels";
import type { Achievement } from "@/domain/health/types";

/** Builds a short, supportive AI summary from the profile + progress. */
function buildAiSummary(params: {
  fullName: string;
  age: number;
  heightCm: number;
  progressPercent: number;
  changeKg: number;
  targetWeightKg: number;
  conditions: string[];
  allergies: string[];
}): string {
  const { age, heightCm, progressPercent, changeKg, targetWeightKg, conditions, allergies } =
    params;
  const parts: string[] = [];
  parts.push(
    `${age} yaşında, ${heightCm} cm boyundasın ve hedefine %${progressPercent} oranında ilerledin.`,
  );
  if (changeKg < 0) {
    parts.push(`Başlangıçtan bu yana ${Math.abs(changeKg).toFixed(1)} kg verdin — güzel bir ivme.`);
  }
  parts.push(`Hedef kilon ${targetWeightKg} kg.`);
  if (conditions.length > 0) {
    parts.push(
      `${conditions.join(" ve ")} durumların göz önünde bulundurularak önerilerini düşük sodyumlu, dengeli glisemik yükte ve kalbe dost seçeneklere göre şekillendiriyorum.`,
    );
  }
  if (allergies.length > 0) {
    parts.push(`${allergies.join(", ")} alerjin nedeniyle bu içerikleri içeren öğünlerde seni uyarırım.`);
  }
  parts.push("Bunlar tıbbi teşhis değil; güvenli beslenme rehberliğidir.");
  return parts.join(" ");
}

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const Icon = healthIcon(achievement.icon);
  const unlocked = achievement.unlockedAt !== null;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors",
        unlocked ? "border-border bg-card" : "border-dashed border-border bg-muted/40 opacity-70",
      )}
    >
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          unlocked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <span className="text-xs font-semibold leading-tight">{achievement.title}</span>
      <span className="text-[11px] leading-tight text-muted-foreground">
        {achievement.description}
      </span>
    </div>
  );
}

/** The full Health Profile screen — the single home for everything about the user. */
export function ProfileView() {
  const profile = useHealthProfile();
  const achievements = useAchievements();
  const entries = useWeightEntries();
  const bloodTests = useBloodTests();

  const analysis = React.useMemo(
    () => analyzeWeight(entries, profile.targetWeightKg),
    [entries, profile.targetWeightKg],
  );

  const aiSummary = React.useMemo(
    () =>
      buildAiSummary({
        fullName: profile.fullName,
        age: profile.age,
        heightCm: profile.heightCm,
        progressPercent: analysis.progressPercent,
        changeKg: analysis.changeKg,
        targetWeightKg: profile.targetWeightKg,
        conditions: profile.healthConditions,
        allergies: profile.allergies,
      }),
    [profile, analysis],
  );

  const initial = profile.fullName.trim().charAt(0).toUpperCase() || "D";
  const unlockedCount = achievements.filter((a) => a.unlockedAt !== null).length;

  const notifyUploadSoon = React.useCallback(() => {
    toast.info("Kan tahlili yükleme yakında", {
      description: "Bu özellik çok yakında aktif olacak.",
    });
  }, []);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-card">
        <div className="flex items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {initial}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{profile.fullName}</h2>
            <p className="text-sm text-muted-foreground">
              {formatLongDate(new Date(profile.memberSince))} tarihinden beri üye
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-lg font-bold">{profile.currentWeightKg.toFixed(1)}</p>
            <p className="text-[11px] text-muted-foreground">Güncel kg</p>
          </div>
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-lg font-bold">{profile.targetWeightKg.toFixed(1)}</p>
            <p className="text-[11px] text-muted-foreground">Hedef kg</p>
          </div>
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-lg font-bold text-primary">%{analysis.progressPercent}</p>
            <p className="text-[11px] text-muted-foreground">İlerleme</p>
          </div>
        </div>
      </section>

      {/* Personal info */}
      <SectionCard icon="user" title="Kişisel Bilgiler">
        <InfoGrid>
          <InfoItem label="Ad" value={profile.fullName} />
          <InfoItem label="Yaş" value={`${profile.age}`} />
          <InfoItem label="Cinsiyet" value={genderLabel(profile.gender)} />
          <InfoItem label="Boy" value={`${profile.heightCm} cm`} />
          <InfoItem label="Aktivite" value={activityLabel(profile.activityLevel)} />
        </InfoGrid>
      </SectionCard>

      {/* Goals */}
      <SectionCard icon="target" title="Hedefler">
        <InfoGrid>
          <InfoItem label="Başlangıç" value={`${profile.startWeightKg} kg`} />
          <InfoItem label="Güncel" value={`${profile.currentWeightKg.toFixed(1)} kg`} />
          <InfoItem label="Hedef" value={`${profile.targetWeightKg} kg`} />
          <InfoItem label="Günlük kalori" value={`${formatNumber(profile.dailyCalorieGoal)} kcal`} />
          <InfoItem label="Günlük su" value={`${formatNumber(profile.dailyWaterGoalMl)} ml`} />
        </InfoGrid>
      </SectionCard>

      {/* Medical info */}
      <SectionCard icon="heart" title="Sağlık Durumu">
        <ChipList
          items={profile.healthConditions}
          tone="warning"
          empty="Kayıtlı bir sağlık durumu yok."
        />
      </SectionCard>

      {/* Food preferences */}
      <SectionCard icon="utensils" title="Beslenme Tercihi">
        <ChipList items={[dietaryLabel(profile.dietaryPreference)]} tone="primary" empty="—" />
      </SectionCard>

      {/* Allergies */}
      <SectionCard icon="flag" title="Alerjiler">
        <ChipList items={profile.allergies} tone="danger" empty="Bilinen bir alerji yok." />
      </SectionCard>

      {/* Weight history summary */}
      <SectionCard
        icon="scale"
        title="Kilo Takibi"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/progress">
              Detay
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      >
        {entries.length === 0 ? (
          <EmptyState
            icon={healthIcon("scale")}
            title="Henüz kilo kaydın yok"
            description="İlk kilonu kaydederek ilerlemeni takip etmeye başla."
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {entries.length} kayıt • başlangıçtan bu yana{" "}
            <span className="font-semibold text-foreground">
              {analysis.changeKg > 0 ? "+" : ""}
              {analysis.changeKg.toFixed(1)} kg
            </span>
          </p>
        )}
      </SectionCard>

      {/* Blood tests */}
      <SectionCard icon="flask" title="Kan Tahlilleri">
        {bloodTests.length === 0 ? (
          <EmptyState
            icon={healthIcon("flask")}
            title="Kan tahlili yok"
            description="İlk kan tahlilini yükle; koçun sonuçlarına göre önerilerini kişiselleştirsin."
            action={{ label: "Tahlil Yükle", onClick: notifyUploadSoon }}
          />
        ) : (
          <ul className="space-y-3">
            {bloodTests.map((test) => (
              <li key={test.id} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{test.title}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatLongDate(new Date(test.date))}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{test.summary}</p>
                {test.flaggedCount > 0 && (
                  <p className="mt-2 inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    {test.flaggedCount} değer takip gerektiriyor
                  </p>
                )}
              </li>
            ))}
            <li>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={notifyUploadSoon}
              >
                <Upload className="size-4" aria-hidden="true" />
                Yeni tahlil yükle
              </Button>
            </li>
          </ul>
        )}
      </SectionCard>

      {/* Achievements */}
      <SectionCard
        icon="trophy"
        title="Başarılar"
        action={
          <span className="text-xs font-medium text-muted-foreground">
            {unlockedCount}/{achievements.length}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {achievements.map((achievement) => (
            <AchievementBadge key={achievement.id} achievement={achievement} />
          ))}
        </div>
      </SectionCard>

      {/* AI summary */}
      <SectionCard icon="sparkles" title="Yapay Zekâ Özeti">
        <p className="text-sm leading-relaxed text-muted-foreground">{aiSummary}</p>
      </SectionCard>
    </div>
  );
}
