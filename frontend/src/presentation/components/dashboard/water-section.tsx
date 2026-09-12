"use client";

import * as React from "react";
import { Bell, Bot, Droplets, Minus, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import {
  dailyTrackingStore,
  useDailyTracking,
} from "@/application/health/daily-tracking-store";
import { healthProfileStore } from "@/application/health/health-profile-store";
import {
  trackingClient,
  type WaterLog,
  type WaterRecommendation,
} from "@/infrastructure/tracking/tracking-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { formatNumber, toPercent } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";

const QUICK_ADD = [
  { amountMl: 250, label: "Bardak" },
  { amountMl: 500, label: "Şişe" },
  { amountMl: 750, label: "Büyük şişe" },
] as const;
const REMINDER_MINUTES = [60, 120, 180] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

interface TrendPoint {
  key: string;
  label: string;
  amountMl: number;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildTrend(logs: WaterLog[], days: number): TrendPoint[] {
  const totals = new Map<string, number>();
  for (const log of logs) {
    const key = dayKey(new Date(log.loggedAt));
    totals.set(key, (totals.get(key) ?? 0) + log.amountMl);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - index - 1));
    const key = dayKey(date);
    return {
      key,
      label: date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }),
      amountMl: totals.get(key) ?? 0,
    };
  });
}

/** Complete persisted FR-010 water experience. */
export function WaterSection() {
  const { waterMl, waterGoalMl } = useDailyTracking();
  const [logs, setLogs] = React.useState<WaterLog[]>([]);
  const [goalDraft, setGoalDraft] = React.useState("");
  const [trendDays, setTrendDays] = React.useState<7 | 30>(7);
  const [reminderMinutes, setReminderMinutes] = React.useState<number>(120);
  const [recommendation, setRecommendation] = React.useState<WaterRecommendation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const since = new Date(Date.now() - 30 * DAY_MS);
    since.setHours(0, 0, 0, 0);
    const [{ logs: recentLogs }, goal] = await Promise.all([
      trackingClient.listWater(since),
      trackingClient.getWaterGoal(),
      dailyTrackingStore.hydrateWaterFromBackend(),
    ]);
    setLogs(recentLogs);
    setGoalDraft(String(goal.dailyWaterGoalMl));
    dailyTrackingStore.setWaterGoal(goal.dailyWaterGoalMl);
    healthProfileStore.update({ dailyWaterGoalMl: goal.dailyWaterGoalMl });
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    void refresh()
      .catch((error: unknown) => {
        if (!active) return;
        toast.error("Su verileri yüklenemedi.", {
          description: error instanceof Error ? error.message : undefined,
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  const percent = waterGoalMl > 0 ? toPercent(waterMl, waterGoalMl) : 0;
  const todayStart = startOfToday().getTime();
  const latestTodayLog = logs.find((log) => new Date(log.loggedAt).getTime() >= todayStart) ?? null;
  const trend = React.useMemo(() => buildTrend(logs, trendDays), [logs, trendDays]);
  const chartMax = Math.max(waterGoalMl, ...trend.map((item) => item.amountMl), 1);

  const addWater = async (amountMl: number) => {
    setBusy(`add-${amountMl}`);
    try {
      const log = await dailyTrackingStore.addWater(amountMl);
      setLogs((current) => [log, ...current]);
      toast.success("Su eklendi", { description: `+${amountMl} ml` });
    } catch (error) {
      toast.error("Su eklenemedi.", {
        description: error instanceof Error ? error.message : "Lütfen tekrar dene.",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeLatest = async () => {
    if (!latestTodayLog) return;
    setBusy("remove");
    try {
      await dailyTrackingStore.removeWater(latestTodayLog.id);
      setLogs((current) => current.filter((item) => item.id !== latestTodayLog.id));
      toast.success("Son su kaydı geri alındı", { description: `-${latestTodayLog.amountMl} ml` });
    } catch (error) {
      toast.error("Su kaydı kaldırılamadı.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const saveGoal = async () => {
    const parsed = Number(goalDraft);
    if (!Number.isInteger(parsed) || parsed < 500 || parsed > 10000) {
      toast.error("Günlük hedef 500–10.000 ml arasında tam sayı olmalı.");
      return;
    }
    setBusy("goal");
    try {
      const result = await trackingClient.updateWaterGoal(parsed);
      dailyTrackingStore.setWaterGoal(result.dailyWaterGoalMl);
      healthProfileStore.update({ dailyWaterGoalMl: result.dailyWaterGoalMl });
      setGoalDraft(String(result.dailyWaterGoalMl));
      toast.success("Su hedefin güncellendi.");
    } catch (error) {
      toast.error("Su hedefi güncellenemedi.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const scheduleReminder = async () => {
    setBusy("reminder");
    try {
      const { notification } = await trackingClient.scheduleWaterReminder(reminderMinutes);
      toast.success("Su hatırlatıcısı planlandı", {
        description: new Date(notification.scheduledFor).toLocaleString("tr-TR"),
      });
    } catch (error) {
      toast.error("Hatırlatıcı planlanamadı.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const loadRecommendation = async () => {
    setBusy("recommendation");
    try {
      const result = await trackingClient.getWaterRecommendation();
      setRecommendation(result.recommendation);
    } catch (error) {
      toast.error("Hidrasyon önerisi alınamadı.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10">
              <Droplets className="size-5 text-sky-500" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">Su Takibi</p>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? "Yükleniyor…"
                  : waterGoalMl > 0
                    ? `${formatNumber(waterMl)} / ${formatNumber(waterGoalMl)} ml`
                    : `${formatNumber(waterMl)} ml`}
              </p>
            </div>
          </div>
          {waterGoalMl > 0 && (
            <span className="text-2xl font-bold tabular-nums text-sky-500">%{percent}</span>
          )}
        </div>

        {waterGoalMl > 0 && <ProgressBar value={percent} indicatorClassName="bg-sky-500" />}

        <div className="grid grid-cols-3 gap-2">
          {QUICK_ADD.map((preset) => (
            <Button
              key={preset.amountMl}
              type="button"
              variant="outline"
              className="h-auto min-h-11 flex-col gap-0.5 py-2 text-xs"
              disabled={busy !== null}
              isLoading={busy === `add-${preset.amountMl}`}
              onClick={() => void addWater(preset.amountMl)}
            >
              <span className="inline-flex items-center gap-1 font-semibold">
                <Plus className="size-3.5" aria-hidden="true" /> {preset.amountMl} ml
              </span>
              <span className="font-normal text-muted-foreground">{preset.label}</span>
            </Button>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={!latestTodayLog || busy !== null}
          isLoading={busy === "remove"}
          onClick={() => void removeLatest()}
        >
          <Minus aria-hidden="true" /> Son kaydı geri al
        </Button>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-xs font-semibold">Günlük hedef</p>
          <div className="flex gap-2">
            <input
              type="number"
              min={500}
              max={10000}
              step={50}
              inputMode="numeric"
              value={goalDraft}
              onChange={(event) => setGoalDraft(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Günlük su hedefi mililitre"
            />
            <Button type="button" variant="outline" disabled={busy !== null} isLoading={busy === "goal"} onClick={() => void saveGoal()}>
              <Save aria-hidden="true" /> Kaydet
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Su trendi</p>
            <div className="flex rounded-lg bg-muted p-0.5 text-xs">
              {([7, 30] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setTrendDays(days)}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium transition",
                    trendDays === days ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {days} gün
                </button>
              ))}
            </div>
          </div>
          <div className="flex h-24 items-end gap-1" aria-label={`${trendDays} günlük su tüketimi grafiği`}>
            {trend.map((item, index) => {
              const height = Math.max(3, Math.round((item.amountMl / chartMax) * 100));
              const showLabel = trendDays === 7 || index % 5 === 0 || index === trend.length - 1;
              return (
                <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${item.label}: ${item.amountMl} ml`}>
                  <div className="w-full rounded-t bg-sky-500/70" style={{ height: `${height}%` }} />
                  <span className="h-3 text-[9px] text-muted-foreground">{showLabel ? item.label : ""}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            value={reminderMinutes}
            onChange={(event) => setReminderMinutes(Number(event.target.value))}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            aria-label="Su hatırlatma süresi"
          >
            {REMINDER_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>{minutes / 60} saat sonra</option>
            ))}
          </select>
          <Button type="button" variant="outline" disabled={busy !== null} isLoading={busy === "reminder"} onClick={() => void scheduleReminder()}>
            <Bell aria-hidden="true" /> Hatırlat
          </Button>
        </div>

        <div className="space-y-2 rounded-xl bg-sky-500/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <Bot className="size-4 text-sky-600" aria-hidden="true" /> Hidrasyon önerisi
            </p>
            <Button type="button" variant="ghost" size="sm" disabled={busy !== null} isLoading={busy === "recommendation"} onClick={() => void loadRecommendation()}>
              Öneri al
            </Button>
          </div>
          {recommendation ? (
            <div className="space-y-1">
              <p className="text-sm leading-relaxed text-muted-foreground">{recommendation.text}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {recommendation.source === "AI" ? "AI destekli" : "Güvenli kural tabanlı yedek"} · 7 gün ort. {recommendation.sevenDayAverageMl} ml
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Son su kayıtların ve kişisel hedefin kullanılarak kısa bir öneri hazırlanır.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
