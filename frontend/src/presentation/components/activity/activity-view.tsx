"use client";

import * as React from "react";
import { Dumbbell, Footprints, Flame, Timer, Undo2, Zap } from "lucide-react";
import { toast } from "sonner";

import { activityStore, useActivity } from "@/application/health/activity-store";
import type { Activity, ActivityType } from "@/infrastructure/activity/activity-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { Input } from "@/presentation/components/ui/input";

const ACTIVITY_OPTIONS: Array<{ value: ActivityType; label: string }> = [
  { value: "WALKING", label: "Yürüyüş" },
  { value: "RUNNING", label: "Koşu" },
  { value: "CYCLING", label: "Bisiklet" },
  { value: "SWIMMING", label: "Yüzme" },
  { value: "STRENGTH_TRAINING", label: "Kuvvet / ağırlık" },
  { value: "PILATES", label: "Pilates" },
  { value: "HOME_EXERCISE", label: "Ev egzersizi" },
  { value: "YOGA", label: "Yoga / esneme" },
  { value: "HIIT", label: "HIIT" },
  { value: "SPORTS", label: "Spor" },
  { value: "OTHER", label: "Diğer hareket" },
];

const QUICK_TASKS: Array<{
  id: string;
  title: string;
  description: string;
  type: ActivityType;
  minutes: number;
  icon: typeof Footprints;
}> = [
  {
    id: "walk-10",
    title: "10 dk yürüyüş",
    description: "Kısa bir hareket molası",
    type: "WALKING",
    minutes: 10,
    icon: Footprints,
  },
  {
    id: "strength-10",
    title: "10 dk kuvvet",
    description: "Vücut ağırlığı veya direnç",
    type: "STRENGTH_TRAINING",
    minutes: 10,
    icon: Dumbbell,
  },
  {
    id: "home-10",
    title: "10 dk ev egzersizi",
    description: "Ekipmansız kısa hareket serisi",
    type: "HOME_EXERCISE",
    minutes: 10,
    icon: Zap,
  },
];

const UNDOABLE_ACTIVITY_COUNT = 3;

function activityLabel(type: ActivityType, name: string | null): string {
  if (name?.trim()) return name;
  return ACTIVITY_OPTIONS.find((option) => option.value === type)?.label ?? "Hareket";
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

function activityDetailText(activity: Activity): string {
  const details = [`${activity.durationMinutes} dk`];
  if (activity.distanceKm != null) details.push(`${activity.distanceKm.toLocaleString("tr-TR")} km`);
  if (activity.perceivedIntensity != null) details.push(`yoğunluk ${activity.perceivedIntensity}/10`);
  return details.join(" · ");
}

function savedActivityDescription(activity: Activity): string {
  const details = [activityDetailText(activity)];
  if (activity.caloriesBurned != null) {
    details.push(`yaklaşık ${Math.round(activity.caloriesBurned)} kcal`);
  }
  return details.join(" · ");
}

export function ActivityView() {
  const { activities, activeMinutes, estimatedCaloriesBurned } = useActivity();
  const [type, setType] = React.useState<ActivityType>("WALKING");
  const [duration, setDuration] = React.useState("10");
  const [distance, setDistance] = React.useState("");
  const [intensity, setIntensity] = React.useState("");
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [quickSaving, setQuickSaving] = React.useState<string | null>(null);
  const [undoingActivityId, setUndoingActivityId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void activityStore.hydrateFromBackend();
  }, []);

  const undoActivity = React.useCallback(
    async (activityId: string) => {
      if (undoingActivityId !== null) return;
      setUndoingActivityId(activityId);

      try {
        await activityStore.deleteActivity(activityId);
        toast.success("Hareket geri alındı");
      } catch {
        toast.error("Hareket geri alınamadı. Lütfen tekrar dene.");
      } finally {
        setUndoingActivityId(null);
      }
    },
    [undoingActivityId],
  );

  const showSavedToast = React.useCallback((title: string, activity: Activity) => {
    toast.success(title, {
      description: savedActivityDescription(activity),
    });
  }, []);

  const save = React.useCallback(async () => {
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      toast.error("Süreyi 1–1440 dakika arasında gir.");
      return;
    }

    const distanceKm = distance.trim() === "" ? undefined : Number(distance);
    if (distanceKm !== undefined && (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 1000)) {
      toast.error("Mesafeyi 0–1000 km arasında gir.");
      return;
    }

    const perceivedIntensity = intensity.trim() === "" ? undefined : Number(intensity);
    if (
      perceivedIntensity !== undefined &&
      (!Number.isInteger(perceivedIntensity) || perceivedIntensity < 1 || perceivedIntensity > 10)
    ) {
      toast.error("Yoğunluğu 1–10 arasında gir.");
      return;
    }

    if (type === "OTHER" && !name.trim()) {
      toast.error("Hareketin adını yaz.");
      return;
    }

    setSaving(true);
    try {
      const activity = await activityStore.logActivity({
        type,
        durationMinutes: minutes,
        distanceKm,
        perceivedIntensity,
        name: name.trim() || undefined,
      });
      showSavedToast("Hareket kaydedildi", activity);
      setName("");
      setDistance("");
      setIntensity("");
    } catch {
      toast.error("Hareket kaydedilemedi. Lütfen tekrar dene.");
    } finally {
      setSaving(false);
    }
  }, [distance, duration, intensity, name, showSavedToast, type]);

  const completeQuickTask = React.useCallback(
    async (task: (typeof QUICK_TASKS)[number]) => {
      if (quickSaving) return;
      setQuickSaving(task.id);
      try {
        const activity = await activityStore.logActivity({
          type: task.type,
          durationMinutes: task.minutes,
          name: task.title,
          note: "Diewish hızlı hareket görevi",
        });
        showSavedToast("Görev tamamlandı", activity);
      } catch {
        toast.error("Görev kaydedilemedi. Lütfen tekrar dene.");
      } finally {
        setQuickSaving(null);
      }
    },
    [quickSaving, showSavedToast],
  );

  return (
    <div className="animate-fade-in space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Bugünkü hareketin</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Yürüyüşten pilatese ve ev egzersizine kadar yaptığın hareketleri kaydet.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Timer className="size-4" aria-hidden="true" />
                <span className="text-xs font-medium">Toplam süre</span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">{activeMinutes} dk</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Flame className="size-4" aria-hidden="true" />
                <span className="text-xs font-medium">Tahmini harcama</span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                ~{Math.round(estimatedCaloriesBurned)} kcal
              </p>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Bugün kaydettiğin her hareketin tahmini enerji harcaması bu toplama dahil edilir. Diewish
          bu değeri günlük yemek hedefini otomatik artırmak için kullanmaz; böylece aktivitenin iki
          kez hesaplanması önlenir.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="quick-activity-heading">
        <div>
          <h2 id="quick-activity-heading" className="text-base font-semibold">
            Hızlı hareket görevleri
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Yaptıysan göreve dokun; hareket hesabına anında kaydedilir.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {QUICK_TASKS.map((task) => {
            const Icon = task.icon;
            const pending = quickSaving === task.id;
            return (
              <button
                key={task.id}
                type="button"
                disabled={quickSaving !== null}
                onClick={() => void completeQuickTask(task)}
                className="group text-left disabled:opacity-60"
              >
                <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-primary/[0.03]">
                  <CardContent className="flex items-center gap-3 p-4 sm:flex-col sm:items-start">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{pending ? "Kaydediliyor…" : task.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </section>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h2 className="text-base font-semibold">Hareket ekle</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Tür ve süre zorunlu; mesafe ile yoğunluk isteğe bağlıdır.
            </p>
          </div>

          <label className="block space-y-1.5 text-sm font-medium">
            Hareket türü
            <select
              value={type}
              onChange={(event) => setType(event.target.value as ActivityType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ACTIVITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-sm font-medium">
            Süre, dakika
            <Input
              inputMode="numeric"
              type="number"
              min={1}
              max={1440}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium">
              Mesafe, km <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
              <Input
                inputMode="decimal"
                type="number"
                min={0}
                max={1000}
                step="0.1"
                placeholder="Örn. 3,5"
                value={distance}
                onChange={(event) => setDistance(event.target.value)}
              />
            </label>

            <label className="block space-y-1.5 text-sm font-medium">
              Yoğunluk, 1–10 <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
              <Input
                inputMode="numeric"
                type="number"
                min={1}
                max={10}
                step={1}
                placeholder="Örn. 6"
                value={intensity}
                onChange={(event) => setIntensity(event.target.value)}
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-sm font-medium">
            Hareket adı <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
            <Input
              maxLength={200}
              placeholder={type === "OTHER" ? "Örn. plank veya merdiven" : "Örn. tempolu yürüyüş"}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <Button className="w-full" disabled={saving} onClick={() => void save()}>
            <Dumbbell aria-hidden="true" />
            {saving ? "Kaydediliyor…" : "Hareketi kaydet"}
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="activity-history-heading">
        <div>
          <h2 id="activity-history-heading" className="text-base font-semibold">
            Bugünkü kayıtlar
          </h2>
          {activities.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Son 3 kaydı gerektiğinde geri alabilirsin.
            </p>
          )}
        </div>
        {activities.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-center text-sm text-muted-foreground">
              Bugün henüz hareket kaydı yok.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activities.slice(0, 12).map((activity, index) => {
              const canUndo = index < UNDOABLE_ACTIVITY_COUNT;
              const undoing = undoingActivityId === activity.id;
              return (
                <Card key={activity.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Footprints className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {activityLabel(activity.type, activity.name)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activityDetailText(activity)} · {timeLabel(activity.loggedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {activity.caloriesBurned != null && (
                        <span className="hidden text-xs font-medium tabular-nums text-muted-foreground sm:inline">
                          ~{Math.round(activity.caloriesBurned)} kcal
                        </span>
                      )}
                      {canUndo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-muted-foreground"
                          disabled={undoingActivityId !== null}
                          isLoading={undoing}
                          aria-label={`${activityLabel(activity.type, activity.name)} kaydını geri al`}
                          onClick={() => void undoActivity(activity.id)}
                        >
                          {!undoing && <Undo2 aria-hidden="true" />}
                          {undoing ? "Geri alınıyor" : "Geri al"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
