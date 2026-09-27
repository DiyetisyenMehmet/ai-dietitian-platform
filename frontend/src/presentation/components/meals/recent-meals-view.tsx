"use client";

import * as React from "react";
import { Clock3, Utensils } from "lucide-react";

import {
  mealsClient,
  type MealLog,
  type MealLogType,
} from "@/infrastructure/tracking/meals-client";
import { Card, CardContent } from "@/presentation/components/ui/card";

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

export function RecentMealsView() {
  const [logs, setLogs] = React.useState<MealLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

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

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Son yediklerin yükleniyor…
        </CardContent>
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

      {groups.map((group) => (
        <section key={group.key} className="space-y-2" aria-labelledby={`recent-meals-${group.key}`}>
          <h2
            id={`recent-meals-${group.key}`}
            className="px-1 text-sm font-bold capitalize text-muted-foreground"
          >
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
                            <h3 className="break-words text-sm font-bold">
                              {log.name?.trim() || "İsimsiz besin kaydı"}
                            </h3>
                            <p className="mt-0.5 text-xs font-medium text-primary">
                              {MEAL_LABELS[log.mealType]}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {timeLabel(log.loggedAt)}
                          </span>
                        </div>

                        {facts.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {facts.map((fact) => (
                              <span key={fact}>{fact}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Bu kayıt için besin değeri girilmemiş.
                          </p>
                        )}
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
    </div>
  );
}
