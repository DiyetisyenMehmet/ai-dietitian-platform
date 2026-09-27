"use client";

import * as React from "react";
import { Clock3, CopyPlus, Repeat2, Utensils } from "lucide-react";
import { toast } from "sonner";

import {
  mealsClient,
  type LogMealInput,
  type MealLog,
  type MealLogType,
} from "@/infrastructure/tracking/meals-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/presentation/components/ui/modal";

const DAYS_TO_LOAD = 90;

const MEAL_LABELS: Record<MealLogType, string> = {
  BREAKFAST: "Kahvaltı",
  LUNCH: "Öğle",
  DINNER: "Akşam",
  SNACK: "Ara öğün",
};

function isBareMealCheckIn(log: MealLog): boolean {
  return (
    log.name === null &&
    log.calories === null &&
    log.proteinG === null &&
    log.carbsG === null &&
    log.fatG === null &&
    log.sodiumMg === null &&
    log.sugarG === null
  );
}

function localDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih bilinmiyor";

  const now = new Date();
  const todayKey = localDayKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = localDayKey(value);

  if (key === todayKey) return "Bugün";
  if (key === localDayKey(yesterday.toISOString())) return "Dün";

  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function numberLabel(value: number | null, unit: string): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${unit}`;
}

function sinceDate(): Date {
  const value = new Date();
  value.setDate(value.getDate() - DAYS_TO_LOAD);
  value.setHours(0, 0, 0, 0);
  return value;
}

function yesterdayKey(): string {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return localDayKey(value.toISOString());
}

function repeatPayload(log: MealLog, mealType: MealLogType): LogMealInput {
  return {
    mealType,
    ...(log.name !== null ? { name: log.name } : {}),
    ...(log.calories !== null ? { calories: log.calories } : {}),
    ...(log.proteinG !== null ? { proteinG: log.proteinG } : {}),
    ...(log.carbsG !== null ? { carbsG: log.carbsG } : {}),
    ...(log.fatG !== null ? { fatG: log.fatG } : {}),
    ...(log.sodiumMg !== null ? { sodiumMg: log.sodiumMg } : {}),
    ...(log.sugarG !== null ? { sugarG: log.sugarG } : {}),
  };
}

function normalizedFoodName(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

interface FrequentFood {
  key: string;
  count: number;
  latest: MealLog;
}

interface RepeatGroup {
  mealType: MealLogType;
  items: MealLog[];
}

export function RecentMealsView() {
  const [logs, setLogs] = React.useState<MealLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [selectedLog, setSelectedLog] = React.useState<MealLog | null>(null);
  const [repeatMealType, setRepeatMealType] = React.useState<MealLogType>("BREAKFAST");
  const [selectedGroup, setSelectedGroup] = React.useState<RepeatGroup | null>(null);
  const [repeatPending, setRepeatPending] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    void mealsClient
      .listMeals(sinceDate())
      .then(({ logs: next }) => {
        if (!alive) return;
        setLogs(next.filter((log) => !isBareMealCheckIn(log)));
        setFailed(false);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const groups = React.useMemo(() => {
    const grouped: Array<{ key: string; label: string; items: MealLog[] }> = [];
    for (const log of logs) {
      const key = localDayKey(log.loggedAt);
      const existing = grouped.find((group) => group.key === key);
      if (existing) existing.items.push(log);
      else grouped.push({ key, label: dayLabel(log.loggedAt), items: [log] });
    }
    return grouped;
  }, [logs]);

  const yesterdayMeals = React.useMemo(() => {
    const byType = new Map<MealLogType, MealLog[]>();
    for (const log of logs) {
      if (localDayKey(log.loggedAt) !== yesterdayKey()) continue;
      const current = byType.get(log.mealType) ?? [];
      current.push(log);
      byType.set(log.mealType, current);
    }
    return Array.from(byType.entries()).map(([mealType, items]) => ({ mealType, items }));
  }, [logs]);

  const frequentFoods = React.useMemo<FrequentFood[]>(() => {
    const byName = new Map<string, FrequentFood>();
    for (const log of logs) {
      const name = log.name?.trim();
      if (!name) continue;
      const key = normalizedFoodName(name);
      const existing = byName.get(key);
      if (existing) existing.count += 1;
      else byName.set(key, { key, count: 1, latest: log });
    }
    return Array.from(byName.values())
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count || b.latest.loggedAt.localeCompare(a.latest.loggedAt))
      .slice(0, 6);
  }, [logs]);

  const startRepeat = React.useCallback((log: MealLog) => {
    setSelectedLog(log);
    setRepeatMealType(log.mealType);
  }, []);

  const confirmRepeat = React.useCallback(async () => {
    if (!selectedLog || repeatPending) return;
    setRepeatPending(true);
    try {
      const { log } = await mealsClient.logMeal(repeatPayload(selectedLog, repeatMealType));
      setLogs((current) => [log, ...current]);
      setSelectedLog(null);
      toast.success(`${selectedLog.name ?? "Besin"} ${MEAL_LABELS[repeatMealType]} öğününe eklendi.`);
    } catch {
      toast.error("Besin tekrar eklenemedi. Lütfen yeniden dene.");
    } finally {
      setRepeatPending(false);
    }
  }, [repeatMealType, repeatPending, selectedLog]);

  const confirmRepeatGroup = React.useCallback(async () => {
    if (!selectedGroup || repeatPending) return;
    setRepeatPending(true);
    const created: MealLog[] = [];
    try {
      for (const source of selectedGroup.items) {
        const { log } = await mealsClient.logMeal(repeatPayload(source, selectedGroup.mealType));
        created.push(log);
      }
      setLogs((current) => [...created.reverse(), ...current]);
      toast.success(`${MEAL_LABELS[selectedGroup.mealType]} öğünü bugüne tekrar eklendi.`);
      setSelectedGroup(null);
    } catch {
      if (created.length > 0) {
        setLogs((current) => [...created.reverse(), ...current]);
        toast.warning("Öğünün bir bölümü eklendi; kalan kayıtlar tamamlanamadı.");
      } else {
        toast.error("Dünkü öğün tekrar eklenemedi. Lütfen yeniden dene.");
      }
    } finally {
      setRepeatPending(false);
    }
  }, [repeatPending, selectedGroup]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">Son yediklerin yükleniyor…</CardContent>
      </Card>
    );
  }

  if (failed) {
    return (
      <Card>
        <CardContent className="space-y-2 p-5">
          <p className="font-semibold">Son yediklerin şu anda yüklenemedi.</p>
          <p className="text-sm text-muted-foreground">
            Bağlantını kontrol edip tekrar deneyebilirsin. Bu ekran yalnız gerçek öğün kayıtlarını okur.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Utensils className="size-6" aria-hidden="true" />
          </span>
          <h2 className="mt-3 font-bold">Henüz kayıtlı bir besin yok</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Öğüne eklediğin veya elle kaydettiğin besinler burada tarihleriyle görünür.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock3 className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold">Son 90 günlük tüketim kayıtların</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Yalnız öğüne gerçekten eklediğin besinler gösterilir. “Yedim” işaretleri, tarama geçmişi ve beslenme planları bu listeye girmez.
            </p>
          </div>
        </div>
      </div>

      {yesterdayMeals.length > 0 && (
        <section className="space-y-2" aria-labelledby="yesterday-repeat-heading">
          <div>
            <h2 id="yesterday-repeat-heading" className="text-sm font-bold">Dünkü öğünü tekrarla</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Yalnız seçtiğin öğün kopyalanır; dünkü kayıt değişmez.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {yesterdayMeals.map((group) => {
              const calories = group.items.reduce((sum, item) => sum + (item.calories ?? 0), 0);
              return (
                <button
                  key={group.mealType}
                  type="button"
                  onClick={() => setSelectedGroup(group)}
                  className="flex min-h-20 items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition hover:bg-muted/30"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <CopyPlus className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{MEAL_LABELS[group.mealType]}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {group.items.length} besin{calories > 0 ? ` · ${Math.round(calories)} kcal` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {frequentFoods.length > 0 && (
        <section className="space-y-2" aria-labelledby="frequent-foods-heading">
          <div>
            <h2 id="frequent-foods-heading" className="text-sm font-bold">Sık Yediklerim</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Son 90 gündeki gerçek öğün kayıtlarından hesaplanır. Tarama kayıtları bu listeyi etkilemez.
            </p>
          </div>
          <div className="space-y-2">
            {frequentFoods.map((item) => (
              <Card key={item.key}>
                <CardContent className="flex items-center gap-3 p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Repeat2 className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{item.latest.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Son 90 günde {item.count} kez · son kayıt {MEAL_LABELS[item.latest.mealType]}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => startRepeat(item.latest)}>
                    Tekrar ekle
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.key} className="space-y-2" aria-labelledby={`recent-meals-${group.key}`}>
          <h2 id={`recent-meals-${group.key}`} className="px-1 text-sm font-bold capitalize text-muted-foreground">
            {group.label}
          </h2>
          <div className="space-y-2">
            {group.items.map((log) => {
              const facts = [
                numberLabel(log.calories, "kcal"),
                numberLabel(log.proteinG, "g protein"),
                numberLabel(log.carbsG, "g karbonhidrat"),
                numberLabel(log.fatG, "g yağ"),
              ].filter((item): item is string => Boolean(item));

              return (
                <Card key={log.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Utensils className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0">
                            <h3 className="break-words text-sm font-bold">{log.name?.trim() || "İsimsiz besin kaydı"}</h3>
                            <p className="mt-0.5 text-xs font-medium text-primary">{MEAL_LABELS[log.mealType]}</p>
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{timeLabel(log.loggedAt)}</span>
                        </div>
                        {facts.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {facts.map((fact) => <span key={fact}>{fact}</span>)}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">Bu kayıt için besin değeri girilmemiş.</p>
                        )}
                        <div className="mt-3 flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => startRepeat(log)}>
                            <Repeat2 aria-hidden="true" /> Tekrar ekle
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Son Yediklerim ayrı bir beslenme görünümüdür. İlerleme &gt; Geçmişim ekranına yeni bir geçmiş türü eklemez ve Tarama Geçmişi ile birleştirilmez.
      </p>

      <Modal open={selectedLog !== null} onOpenChange={(open) => !open && !repeatPending && setSelectedLog(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Besini tekrar ekle</ModalTitle>
            <ModalDescription>
              Eski kayıt değişmeden kalır. Onayladığında bugüne yeni bir tüketim kaydı oluşturulur.
            </ModalDescription>
          </ModalHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="font-semibold">{selectedLog.name ?? "Besin"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedLog.calories !== null ? `${Math.round(selectedLog.calories)} kcal · ` : ""}
                  Önceki öğün: {MEAL_LABELS[selectedLog.mealType]}
                </p>
              </div>
              <div>
                <label htmlFor="repeat-meal-type" className="mb-1.5 block text-sm font-medium">
                  Bugün hangi öğüne eklensin?
                </label>
                <select
                  id="repeat-meal-type"
                  value={repeatMealType}
                  onChange={(event) => setRepeatMealType(event.target.value as MealLogType)}
                  className="min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm"
                >
                  {Object.entries(MEAL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <ModalFooter>
            <Button variant="outline" disabled={repeatPending} onClick={() => setSelectedLog(null)}>İptal</Button>
            <Button isLoading={repeatPending} onClick={() => void confirmRepeat()}>Öğüne ekle</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={selectedGroup !== null} onOpenChange={(open) => !open && !repeatPending && setSelectedGroup(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Dünkü öğünü tekrar ekle</ModalTitle>
            <ModalDescription>
              Dünkü öğün olduğu gibi değiştirilmez. İçindeki besinler bugüne yeni kayıtlar olarak eklenir.
            </ModalDescription>
          </ModalHeader>
          {selectedGroup && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{MEAL_LABELS[selectedGroup.mealType]}</p>
              {selectedGroup.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <span className="min-w-0 break-words font-medium">{item.name ?? "Besin"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.calories === null ? "Kalori bilgisi yok" : `${Math.round(item.calories)} kcal`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <ModalFooter>
            <Button variant="outline" disabled={repeatPending} onClick={() => setSelectedGroup(null)}>İptal</Button>
            <Button isLoading={repeatPending} onClick={() => void confirmRepeatGroup()}>Öğünü tekrar ekle</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
