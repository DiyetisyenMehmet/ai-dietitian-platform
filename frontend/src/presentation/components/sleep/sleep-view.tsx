"use client";

import * as React from "react";
import { Brain, CalendarDays, Moon, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  sleepClient,
  type DailySleepAssessment,
  type SleepAiComment,
  type SleepLog,
  type WeeklySleepAnalysis,
} from "@/infrastructure/sleep/sleep-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { Input } from "@/presentation/components/ui/input";

const DAY_MS = 24 * 60 * 60 * 1000;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateTimeInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function durationLabel(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

function qualityLabel(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}/5`;
}

function dateTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function defaultTimes(): { sleepStart: string; wakeTime: string } {
  const wake = new Date();
  wake.setSeconds(0, 0);
  const start = new Date(wake.getTime() - 8 * 60 * 60 * 1000);
  return { sleepStart: localDateTimeInput(start), wakeTime: localDateTimeInput(wake) };
}

export function SleepView() {
  const defaults = React.useMemo(defaultTimes, []);
  const today = React.useMemo(() => localDateKey(new Date()), []);
  const [sleepStart, setSleepStart] = React.useState(defaults.sleepStart);
  const [wakeTime, setWakeTime] = React.useState(defaults.wakeTime);
  const [quality, setQuality] = React.useState("3");
  const [note, setNote] = React.useState("");
  const [logs, setLogs] = React.useState<SleepLog[]>([]);
  const [daily, setDaily] = React.useState<DailySleepAssessment | null>(null);
  const [weekly, setWeekly] = React.useState<WeeklySleepAnalysis | null>(null);
  const [aiComment, setAiComment] = React.useState<SleepAiComment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const since = new Date(Date.now() - 14 * DAY_MS);
      const [logResult, dailyResult, weeklyResult] = await Promise.all([
        sleepClient.list(since),
        sleepClient.dailyAssessment(today),
        sleepClient.weeklyAnalysis(today),
      ]);
      setLogs(logResult.sleeps);
      setDaily(dailyResult.assessment);
      setWeekly(weeklyResult.analysis);
    } catch {
      toast.error("Uyku verileri yüklenemedi. Lütfen tekrar dene.");
    } finally {
      setLoading(false);
    }
  }, [today]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = React.useCallback(async () => {
    const start = new Date(sleepStart);
    const wake = new Date(wakeTime);
    const minutes = Math.round((wake.getTime() - start.getTime()) / 60_000);
    const qualityNumber = Number(quality);
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 1440) {
      toast.error("Uyku başlangıcı ile uyanma arasında 15 dakika–24 saat olmalı.");
      return;
    }
    if (!Number.isInteger(qualityNumber) || qualityNumber < 1 || qualityNumber > 5) {
      toast.error("Uyku kalitesini 1–5 arasında seç.");
      return;
    }

    setSaving(true);
    try {
      await sleepClient.create({
        sleepStart: start.toISOString(),
        wakeTime: wake.toISOString(),
        quality: qualityNumber,
        note: note.trim() || undefined,
      });
      toast.success("Uyku kaydı eklendi");
      setNote("");
      setAiComment(null);
      await refresh();
    } catch {
      toast.error("Uyku kaydı eklenemedi. Lütfen bilgileri kontrol et.");
    } finally {
      setSaving(false);
    }
  }, [note, quality, refresh, sleepStart, wakeTime]);

  const remove = React.useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await sleepClient.remove(id);
      setAiComment(null);
      await refresh();
      toast.success("Uyku kaydı silindi");
    } catch {
      toast.error("Uyku kaydı silinemedi.");
    } finally {
      setDeletingId(null);
    }
  }, [refresh]);

  const requestAiComment = React.useCallback(async () => {
    setAiLoading(true);
    try {
      setAiComment(await sleepClient.aiComment(today));
    } catch {
      toast.error("AI uyku yorumu şu anda oluşturulamadı.");
    } finally {
      setAiLoading(false);
    }
  }, [today]);

  return (
    <div className="animate-fade-in space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Uyku özeti</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Süre, öznel kalite ve düzenliliği birlikte takip et.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Moon className="size-4" aria-hidden="true" />
                <span className="text-xs font-medium">Bugün</span>
              </div>
              <p className="mt-2 text-xl font-bold tabular-nums">
                {loading ? "…" : durationLabel(daily?.totalDurationMinutes ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Kalite {qualityLabel(daily?.averageQuality ?? null)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden="true" />
                <span className="text-xs font-medium">7 günlük ortalama</span>
              </div>
              <p className="mt-2 text-xl font-bold tabular-nums">
                {loading ? "…" : durationLabel(weekly?.averageDurationMinutes ?? null)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {weekly?.nightsLogged ?? 0}/7 gece kayıtlı
              </p>
            </CardContent>
          </Card>
        </div>
        {daily && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold">Günlük değerlendirme</p>
              <p className="mt-1 text-sm text-muted-foreground">{daily.assessment}</p>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Uyku ekle</h2>
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                Uyku başlangıcı
                <Input type="datetime-local" value={sleepStart} onChange={(event) => setSleepStart(event.target.value)} />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Uyanma saati
                <Input type="datetime-local" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              Uyku kalitesi
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={quality}
                onChange={(event) => setQuality(event.target.value)}
              >
                <option value="1">1 — Çok kötü</option>
                <option value="2">2 — Kötü</option>
                <option value="3">3 — Orta</option>
                <option value="4">4 — İyi</option>
                <option value="5">5 — Çok iyi</option>
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Not (isteğe bağlı)
              <textarea
                className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Gece uyanma, dinlenmiş hissetme gibi bir not ekleyebilirsin."
              />
            </label>
            <Button className="w-full" onClick={() => void save()} isLoading={saving}>
              Uyku kaydını ekle
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Haftalık analiz</h2>
            <p className="text-sm text-muted-foreground">Son 7 günün süre, kalite ve düzenlilik özeti.</p>
          </div>
          <div className="rounded-full bg-secondary px-3 py-1 text-sm font-bold">
            {weekly?.sleepScore ?? "—"}/100
          </div>
        </div>
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Ortalama kalite</p>
                <p className="font-semibold">{qualityLabel(weekly?.averageQuality ?? null)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">7–9 saat hedefi</p>
                <p className="font-semibold">{weekly?.targetNights ?? 0} gece</p>
              </div>
              <div>
                <p className="text-muted-foreground">Düzenlilik</p>
                <p className="font-semibold">{weekly?.regularityScore ?? "—"}/100</p>
              </div>
              <div>
                <p className="text-muted-foreground">Hedef oranı</p>
                <p className="font-semibold">%{weekly?.targetRatePercent ?? 0}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{weekly?.assessment ?? "Henüz yeterli veri yok."}</p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void requestAiComment()}
              isLoading={aiLoading}
            >
              <Sparkles aria-hidden="true" /> AI yorumunu oluştur
            </Button>
            {aiComment && (
              <div className="rounded-xl bg-secondary/60 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Brain className="size-4" aria-hidden="true" />
                  {aiComment.generatedBy === "AI" ? "AI uyku yorumu" : "Uyku değerlendirmesi"}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{aiComment.comment}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Genel iyi oluş bilgisidir; tıbbi tanı veya tedavi önerisi değildir.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Son kayıtlar</h2>
        {logs.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Henüz uyku kaydı yok.</CardContent></Card>
        ) : (
          logs.slice(0, 7).map((sleep) => (
            <Card key={sleep.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{durationLabel(sleep.durationMinutes)} · {sleep.quality}/5</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateTimeLabel(sleep.sleepStart)} → {dateTimeLabel(sleep.wakeTime)}
                  </p>
                  {sleep.note && <p className="mt-1 truncate text-xs text-muted-foreground">{sleep.note}</p>}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Uyku kaydını sil"
                  isLoading={deletingId === sleep.id}
                  onClick={() => void remove(sleep.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
