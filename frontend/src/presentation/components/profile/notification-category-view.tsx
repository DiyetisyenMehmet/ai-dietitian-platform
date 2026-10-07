"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Clock3, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { NotificationPreferences } from "@/domain/account/types";
import {
  NOTIFICATION_DETAILS,
  notificationDetailMeta,
  type NotificationDetailSlug,
} from "@/domain/account/notification-category";
import { WEEK_DAYS, isReminderTime } from "@/domain/account/water-reminder-plan";
import { buildMealReminderEntries } from "@/domain/account/meal-reminder-plan";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
import {
  loadMealReminderContext,
  mealReminderGate,
  syncMealReminderPreference,
  MealReminderGateError,
  type MealReminderContext,
} from "@/infrastructure/notifications/native-meals";
import { syncWellnessReminderSchedule } from "@/infrastructure/notifications/native-wellness";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { Input } from "@/presentation/components/ui/input";
import { NotificationAlertsLink } from "./notification-alerts-view";
import {
  CategoryIcon,
  PreferenceSwitch,
  notificationPlanSummary,
} from "./notification-preference-category";

export function NotificationCategoryView({ category }: { category: NotificationDetailSlug }) {
  const config = NOTIFICATION_DETAILS[category];
  const item = notificationDetailMeta(category);
  const timeField = "timeField" in config ? config.timeField : null;
  const [preferences, setPreferences] = React.useState<NotificationPreferences | null>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [time, setTime] = React.useState("");
  const [day, setDay] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [attempt, setAttempt] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const saveLock = React.useRef(false);
  const [mealContext, setMealContext] = React.useState<MealReminderContext | null>(null);
  const [mealLoading, setMealLoading] = React.useState(category === "meals");
  const [mealError, setMealError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreferences(null);
    setError(null);
    setSaved(false);
    void notificationClient
      .getPreferences()
      .then(({ preferences: next }) => {
        if (cancelled) return;
        setPreferences(next);
        setEnabled(next[config.key]);
        setTime(timeField ? next[timeField] : "");
        setDay(next.weeklySummaryDay);
        if (config.kind === "daily") syncWellnessReminderSchedule(next);
        if (category === "meals" && !next.mealReminders) syncMealReminderPreference(next);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Bildirim tercihlerin yüklenemedi. Bağlantını kontrol edip tekrar deneyebilirsin.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, category, config.key, config.kind, timeField]);

  React.useEffect(() => {
    if (category !== "meals") return;
    let cancelled = false;
    setMealLoading(true);
    setMealContext(null);
    setMealError(null);
    void loadMealReminderContext()
      .then((context) => {
        if (!cancelled) setMealContext(context);
      })
      .catch(() => {
        if (!cancelled)
          setMealError(
            "Öğün planın veya abonelik bilgin alınamadı. Hatırlatmaları açmadan önce tekrar dene.",
          );
      })
      .finally(() => {
        if (!cancelled) setMealLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, category]);

  const changed = () => {
    setSaved(false);
    setError(null);
  };
  const save = async () => {
    if (!preferences || saveLock.current || (timeField && !isReminderTime(time))) return;
    saveLock.current = true;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Re-read plan and entitlement before enabling; the preview may have become stale.
      const context = category === "meals" && enabled ? await loadMealReminderContext() : null;
      const gate = context ? mealReminderGate(context) : null;
      if (gate) {
        setMealContext(context);
        throw new MealReminderGateError(gate);
      }
      const patch = {
        [config.key]: enabled,
        ...(timeField
          ? { [timeField]: time, timezoneOffsetMinutes: new Date().getTimezoneOffset() }
          : {}),
        ...(category === "weekly" ? { weeklySummaryDay: day } : {}),
      };
      const { preferences: next } = await notificationClient.updatePreferences(patch);
      if (
        Object.entries(patch).some(
          ([key, value]) => next[key as keyof NotificationPreferences] !== value,
        )
      )
        throw new Error("Tercihin sunucuda doğrulanamadı.");
      setPreferences(next);
      setEnabled(next[config.key]);
      setTime(timeField ? next[timeField] : "");
      setDay(next.weeklySummaryDay);
      setSaved(true);
      if (config.kind === "daily") syncWellnessReminderSchedule(next);
      if (category === "meals") {
        if (context) setMealContext(context);
        syncMealReminderPreference(next, context ?? undefined);
      }
      toast.success("Bildirim tercihin kaydedildi");
    } catch (failure) {
      setEnabled(preferences[config.key]);
      setTime(timeField ? preferences[timeField] : "");
      setDay(preferences.weeklySummaryDay);
      setError(
        failure instanceof MealReminderGateError
          ? failure.message
          : "Tercihin kaydedilemedi. Son kayıtlı ayarların geri yüklendi; tekrar deneyebilirsin.",
      );
      toast.error("Bildirim tercihin kaydedilemedi");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <p className="text-sm text-muted-foreground">Bildirim tercihlerin yükleniyor…</p>
        <div
          aria-hidden="true"
          className="h-64 animate-pulse rounded-2xl bg-muted/50 motion-reduce:animate-none"
        />
      </div>
    );
  if (!preferences)
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Tekrar dene
          </Button>
        </CardContent>
      </Card>
    );

  const dirty =
    enabled !== preferences[config.key] ||
    (timeField !== null && time !== preferences[timeField]) ||
    (category === "weekly" && day !== preferences.weeklySummaryDay);
  const draft = {
    ...preferences,
    [config.key]: enabled,
    ...(timeField ? { [timeField]: time } : {}),
    ...(category === "weekly" ? { weeklySummaryDay: day } : {}),
  };
  const mealGate = mealContext ? mealReminderGate(mealContext) : null;
  const enableBlocked =
    category === "meals" && !enabled && (mealLoading || !mealContext || Boolean(mealGate));
  const timeLabel =
    category === "sleep"
      ? "Uykuya hazırlık saati"
      : category === "weekly"
        ? "Özet saati"
        : "Hareket hatırlatma saati";

  return (
    <div className="space-y-4" data-notification-detail={category} data-saving={saving}>
      <div className="flex items-start gap-3 rounded-2xl bg-primary/5 p-4">
        <CategoryIcon category={config.key} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-5">{item.label}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
        </div>
        <PreferenceSwitch
          label={item.label}
          enabled={enabled}
          busy={saving || enableBlocked}
          onToggle={() => {
            setEnabled(!enabled);
            changed();
          }}
        />
      </div>
      {!enabled && (
        <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          {category === "coach"
            ? "Koç bildirimleri kapalı. Koç ekranını kullanmaya devam edebilirsin."
            : "Hatırlatmalar kapalı. Kayıtlı programın korunur."}
        </p>
      )}
      {config.kind === "daily" && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Clock3 className="size-4 text-primary" aria-hidden="true" />
                Günlük program
              </p>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                Her gün
              </span>
            </div>
            <label htmlFor="category-time" className="block text-xs font-medium">
              {timeLabel}
            </label>
            <Input
              id="category-time"
              type="time"
              className="h-14 text-lg"
              value={time}
              disabled={saving}
              onChange={(event) => {
                setTime(event.target.value);
                changed();
              }}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {category === "sleep"
                ? "Uyumadan önce rutinine zaman ayırabileceğin bir saat seç. Bu hatırlatma uyku kaydı oluşturmaz."
                : "Gün içinde kısa bir hareket molasına uygun saat seç. Bu hatırlatma aktivite kaydı oluşturmaz."}
            </p>
            <p className="rounded-xl bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
              Her gün bir nazik hatırlatma. Saatini değiştirmek, diğer bildirim programlarını
              değiştirmez.
            </p>
          </CardContent>
        </Card>
      )}
      {config.kind === "weekly" && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4 text-primary" aria-hidden="true" />
              Haftalık program
            </p>
            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Özet günü">
              {WEEK_DAYS.map((entry) => (
                <button
                  key={entry.day}
                  type="button"
                  aria-label={entry.label}
                  aria-pressed={day === entry.day}
                  disabled={saving}
                  className={`min-h-11 rounded-xl text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${day === entry.day ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  onClick={() => {
                    setDay(entry.day);
                    changed();
                  }}
                >
                  {entry.short}
                </button>
              ))}
            </div>
            <label htmlFor="category-time" className="block text-xs font-medium">
              {timeLabel}
            </label>
            <Input
              id="category-time"
              type="time"
              className="h-14 text-lg"
              value={time}
              disabled={saving}
              onChange={(event) => {
                setTime(event.target.value);
                changed();
              }}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Özetin hazırlandığında, seçtiğin haftalık zamanda hesabın üzerinden gönderilir. Bu
              cihazda ayrıca bir haftalık alarm kurulmaz.
            </p>
            <p className="rounded-xl bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
              Bu tercih hazır değerlendirme bildirimlerini yönetir. Koç yorumunun hazırlanması
              mevcut hesap ve izin koşullarına bağlıdır.
            </p>
          </CardContent>
        </Card>
      )}
      {config.kind === "event" && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              Koç önerileri hazır olduğunda
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Hedeflerinle ilgili öneriler ve hatırlatmalar, Koç tarafından hazırlandığında haber
              verelim. Bu kategori için sabit bir saat veya günlük tekrar planı bulunmuyor.
            </p>
            <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
              <p>Önerilerin hazırlanması mevcut hesap ve veri izinlerine bağlıdır.</p>
              <p>Bu ayarı kapatmak Koç sohbetini veya veri izinlerini değiştirmez.</p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/ai">Koç ekranını aç</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {config.kind === "plan" && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4 text-primary" aria-hidden="true" />
              Aktif öğün planından
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Öğün saatleri beslenme planından alınır. Burada ayrı saat eklenmez; planın günleri ve
              mevcut abonelik koşulları korunur.
            </p>
            {mealLoading ? (
              <p role="status" className="text-xs text-muted-foreground">
                Öğün planın ve aboneliğin kontrol ediliyor…
              </p>
            ) : mealError ? (
              <>
                <p role="alert" className="text-xs text-destructive">
                  {mealError}
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Planı tekrar kontrol et
                </Button>
              </>
            ) : (
              <>
                {mealGate && (
                  <p
                    className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground"
                    data-meal-gate
                  >
                    {mealGate}
                  </p>
                )}
                {mealContext?.plan && <MealPreview context={mealContext} />}
                {mealContext && !mealContext.paid && (
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/pricing">Abonelik seçeneklerini gör</Link>
                  </Button>
                )}
              </>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link href="/meals/plan">Öğün planını aç</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <NotificationAlertsLink category={category} />
      <div className="flex items-start gap-2 rounded-2xl bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Tercihlerin Diewish hesabında saklanır. Bildirim alabilmek için kullandığın platformda
          bildirim izninin ve bildirim bağlantısının açık olması gerekir.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
        >
          {error}
        </p>
      )}
      <div className="sticky bottom-0 space-y-2 border-t border-border bg-background/95 py-3 backdrop-blur-sm">
        <p className="text-xs text-muted-foreground" data-detail-summary>
          {notificationPlanSummary(config.key, draft)}
        </p>
        <Button
          type="button"
          className="w-full"
          isLoading={saving}
          disabled={!dirty || saving || Boolean(timeField && !isReminderTime(time))}
          onClick={() => void save()}
        >
          Kaydet
        </Button>
        <p
          role="status"
          aria-live="polite"
          className="min-h-4 text-center text-xs text-muted-foreground"
        >
          {saving
            ? "Kaydediliyor…"
            : saved
              ? "✓ Kaydedildi"
              : dirty
                ? "Değişikliklerin henüz kaydedilmedi."
                : "Tercihlerin Diewish hesabında saklanır."}
        </p>
      </div>
    </div>
  );
}

function MealPreview({ context }: { context: MealReminderContext }) {
  const plan = context.plan!;
  const upcoming = buildMealReminderEntries(plan)
    .filter((entry) => entry.at > Date.now())
    .sort((a, b) => a.at - b.at)
    .slice(0, 6);
  return (
    <div className="space-y-3" data-meal-preview>
      <p className="text-xs font-semibold">
        {plan.dailyPlans.durationDays} günlük aktif plan · Sürüm {plan.version}
      </p>
      {upcoming.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">Yaklaşan öğünler</p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {upcoming.map((entry) => {
              const [dayNumber, index] = entry.id
                .slice(plan.id.length + 1)
                .split(":")
                .map(Number);
              const mapping = plan.dailyPlans.calendar.find((day) => day.dayNumber === dayNumber);
              const meal =
                plan.dailyPlans.cycle[mapping?.cycleIndex ?? dayNumber - 1]?.meals[index];
              const date = new Date(entry.at);
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{meal?.name ?? "Öğün"}</p>
                    <p className="mt-1 text-muted-foreground">
                      {date.toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "long",
                        weekday: "short",
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-3 py-1 tabular-nums">
                    {date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
