"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  Camera,
  CreditCard,
  FlaskConical,
  Heart,
  LineChart,
  LogOut,
  Lock,
  Trophy,
  UserPen,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate } from "@/shared/lib/format";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import {
  SectionCard,
  ChipList,
} from "@/presentation/components/health/section-card";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { SettingGroup, SettingRow } from "@/presentation/components/profile/setting-row";
import { useHealthProfile, useAchievements } from "@/application/health/health-profile-store";
import { useWeightEntries, analyzeWeight } from "@/application/health/weight-store";
import { useAccount, accountStore } from "@/application/account/account-store";
import { useSubscription, planForTier } from "@/application/payments/subscription-store";
import { useAuth, authStore } from "@/application/auth/auth-store";
import { authService } from "@/application/auth/auth-service";
import { dietaryLabel } from "@/application/health/labels";
import type { Achievement } from "@/domain/health/types";

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

/** The profile hub — a professional account home with grouped settings. */
export function ProfileView() {
  const router = useRouter();
  const profile = useHealthProfile();
  const achievements = useAchievements();
  const entries = useWeightEntries();
  const { avatarDataUrl } = useAccount();
  const { subscription } = useSubscription();
  const { user } = useAuth();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [loggingOut, setLoggingOut] = React.useState(false);

  const analysis = React.useMemo(
    () => analyzeWeight(entries, profile.targetWeightKg),
    [entries, profile.targetWeightKg],
  );

  const initial = profile.fullName.trim().charAt(0).toUpperCase() || "D";
  const unlockedCount = achievements.filter((a) => a.unlockedAt !== null).length;
  const planName = planForTier(subscription.tier).name;
  const email = user?.email ?? "";

  const onPickAvatar = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seç.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Görsel 4 MB'den küçük olmalı.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      accountStore.setAvatar(String(reader.result));
      toast.success("Profil fotoğrafın güncellendi.");
    };
    reader.readAsDataURL(file);
  }, []);

  const onLogout = React.useCallback(async () => {
    setLoggingOut(true);
    const refreshToken = authStore.getRefreshToken();
    try {
      if (refreshToken) await authService.logout(refreshToken);
    } catch {
      // best-effort revoke; proceed with local sign-out regardless
    }
    authStore.clear();
    accountStore.reset();
    toast.success("Çıkış yapıldı. Görüşmek üzere!");
    router.push("/login");
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Hero with avatar upload */}
      <section className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-card">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Profil fotoğrafını değiştir"
          >
            {avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarDataUrl}
                alt="Profil fotoğrafı"
                className="size-16 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                {initial}
              </span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card transition-transform group-hover:scale-110">
              <Camera className="size-3.5" aria-hidden="true" />
            </span>
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{profile.fullName}</h2>
            {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatLongDate(new Date(profile.memberSince))} tarihinden beri üye
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onPickAvatar}
        />
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-lg font-bold tabular-nums">{profile.currentWeightKg.toFixed(1)}</p>
            <p className="text-[11px] text-muted-foreground">Güncel kg</p>
          </div>
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-lg font-bold tabular-nums">{profile.targetWeightKg.toFixed(1)}</p>
            <p className="text-[11px] text-muted-foreground">Hedef kg</p>
          </div>
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-lg font-bold tabular-nums text-primary">%{analysis.progressPercent}</p>
            <p className="text-[11px] text-muted-foreground">İlerleme</p>
          </div>
        </div>
      </section>

      {/* Account */}
      <SettingGroup title="Hesap">
        <SettingRow icon={UserPen} label="Profili düzenle" description="Ad, sağlık bilgileri ve hedefler" href="/profile/edit" />
        <SettingRow
          icon={CreditCard}
          label="Abonelik"
          description="Planını yönet ve faturalarını gör"
          value={planName}
          href="/profile/subscription"
        />
        <SettingRow icon={Bell} label="Bildirim tercihleri" description="Hatırlatmaları ve özetleri ayarla" href="/profile/notifications" />
        <SettingRow icon={Lock} label="Şifre değiştir" description="Hesap güvenliğini güncelle" href="/profile/security" />
        <SettingRow
          icon={LogOut}
          label={loggingOut ? "Çıkış yapılıyor..." : "Çıkış yap"}
          tone="danger"
          onClick={loggingOut ? undefined : onLogout}
        />
      </SettingGroup>

      {/* Health data */}
      <SettingGroup title="Sağlık Verilerim">
        <SettingRow icon={Heart} label="Sağlık bilgilerimi düzenle" description="Boy, kilo, aktivite, hastalık ve alerjiler" href="/profile/edit" />
        <SettingRow icon={FlaskConical} label="Kan tahlilleri" description="Yükle, geçmişi ve analizleri gör" href="/profile/blood-tests" />
        <SettingRow icon={LineChart} label="Kilo & ilerleme" description="Haftalık ve aylık trendler" href="/progress" />
      </SettingGroup>

      {/* Health snapshot */}
      <SectionCard icon="heart" title="Sağlık Durumu">
        <ChipList items={profile.healthConditions} tone="warning" empty="Kayıtlı bir sağlık durumu yok." />
      </SectionCard>

      <SectionCard icon="utensils" title="Beslenme Tercihi">
        <ChipList items={[dietaryLabel(profile.dietaryPreference)]} tone="primary" empty="—" />
      </SectionCard>

      <SectionCard icon="flag" title="Alerjiler">
        <ChipList items={profile.allergies} tone="danger" empty="Bilinen bir alerji yok." />
      </SectionCard>

      {/* Achievements */}
      <SectionCard
        icon="trophy"
        title="Başarılar"
        action={
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Trophy className="size-3.5" aria-hidden="true" />
            {unlockedCount}/{achievements.length}
          </span>
        }
      >
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Rozet ilerlemen</span>
            <span className="font-semibold">
              %{Math.round((unlockedCount / achievements.length) * 100)}
            </span>
          </div>
          <ProgressBar value={Math.round((unlockedCount / achievements.length) * 100)} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {achievements.map((achievement) => (
            <AchievementBadge key={achievement.id} achievement={achievement} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
