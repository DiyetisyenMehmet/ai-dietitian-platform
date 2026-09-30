"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Clock3,
  Flame,
  Package,
  ScanBarcode,
} from "lucide-react";

import {
  nutritionClient,
  type ScanHistoryItemDto,
} from "@/infrastructure/nutrition/nutrition-client";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { NutritionFactsGrid } from "@/presentation/components/meals/nutrition-scan-sections";

type Filter = "ALL" | "PHOTO" | "BARCODE";

function localDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih bilinmiyor";

  const today = new Date();
  const todayKey = localDayKey(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDayKey(yesterday.toISOString());
  const key = localDayKey(value);

  if (key === todayKey) return "Bugün";
  if (key === yesterdayKey) return "Dün";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
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

function compactNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function PhotoDetail({
  item,
  onBack,
}: {
  item: ScanHistoryItemDto;
  onBack(): void;
}) {
  const photo = item.photo;
  if (!photo) return null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Tarama geçmişine dön
      </button>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Camera className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Fotoğraf taraması
              </p>
              <h2 className="mt-1 break-words text-xl font-extrabold">{photo.dishName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {photo.estimatedPortion}
                {photo.estimatedGrams !== null ? ` · ${compactNumber(photo.estimatedGrams)} g` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {dateLabel(item.scannedAt)} · {timeLabel(item.scannedAt)}
              </p>
            </div>
          </div>

          <NutritionFactsGrid
            portion={photo.totals}
            portionLabel={photo.estimatedGrams !== null ? `${compactNumber(photo.estimatedGrams)} g` : "Taranan porsiyon"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h3 className="font-bold">Taramada belirlenen içerikler</h3>
          {photo.ingredients.filter((item) => item.included).length === 0 ? (
            <p className="text-sm text-muted-foreground">İçerik ayrıntısı bulunamadı.</p>
          ) : (
            <div className="space-y-2">
              {photo.ingredients
                .filter((ingredient) => ingredient.included)
                .map((ingredient, index) => (
                  <div
                    key={`${ingredient.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
                  >
                    <span className="min-w-0 break-words font-semibold">{ingredient.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {ingredient.estimatedGrams === null
                        ? "Miktar belirsiz"
                        : `~${compactNumber(ingredient.estimatedGrams)} g`}
                    </span>
                  </div>
                ))}
            </div>
          )}
          {photo.disclaimer && (
            <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
              {photo.disclaimer}
            </p>
          )}
        </CardContent>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Bu kayıt yalnız Besin Tarayıcı geçmişidir. Taranmış olması, yemeğin tüketildiği anlamına gelmez ve İlerleme &gt; Geçmişim verisine dönüşmez.
      </p>
    </div>
  );
}

export function ScanHistoryView() {
  const [scans, setScans] = React.useState<ScanHistoryItemDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [selectedPhotoId, setSelectedPhotoId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    void nutritionClient
      .scanHistory(100)
      .then(({ scans: next }) => {
        if (!alive) return;
        setScans(next);
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

  const selectedPhoto =
    selectedPhotoId === null
      ? null
      : scans.find((item) => item.id === selectedPhotoId && item.scanType === "PHOTO") ?? null;

  const filtered = React.useMemo(
    () => scans.filter((item) => filter === "ALL" || item.scanType === filter),
    [filter, scans],
  );

  const groups = React.useMemo(() => {
    const result: Array<{ key: string; label: string; items: ScanHistoryItemDto[] }> = [];
    for (const scan of filtered) {
      const key = localDayKey(scan.scannedAt);
      const existing = result.find((group) => group.key === key);
      if (existing) existing.items.push(scan);
      else result.push({ key, label: dateLabel(scan.scannedAt), items: [scan] });
    }
    return result;
  }, [filtered]);

  if (selectedPhoto) {
    return <PhotoDetail item={selectedPhoto} onBack={() => setSelectedPhotoId(null)} />;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Tarama geçmişin yükleniyor…
        </CardContent>
      </Card>
    );
  }

  if (failed) {
    return (
      <Card>
        <CardContent className="space-y-2 p-5">
          <p className="font-semibold">Tarama geçmişi şu anda yüklenemedi.</p>
          <p className="text-sm text-muted-foreground">
            Bir süre sonra tekrar deneyebilirsin. Bu ekran İlerleme &gt; Geçmişim verilerini kullanmaz.
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
            <h2 className="text-sm font-bold">Besin Tarayıcı geçmişi</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Fotoğraf ve barkod taramaları burada tutulur. Tarama, tüketim kaydı değildir. Bu alan İlerleme &gt; Geçmişim sisteminden tamamen ayrıdır.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Tarama geçmişi filtresi">
        {([
          ["ALL", "Tümü"],
          ["PHOTO", "Fotoğraf"],
          ["BARCODE", "Barkod"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-10 rounded-xl border px-2 text-sm font-semibold transition ${
              filter === value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Clock3 className="mx-auto size-7 text-primary" aria-hidden="true" />
            <h2 className="mt-3 font-bold">Bu kategoride henüz tarama yok</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Yeni fotoğraf veya barkod taramaların tarihleriyle burada görünür.
            </p>
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-2" aria-labelledby={`scan-day-${group.key}`}>
            <h2 id={`scan-day-${group.key}`} className="px-1 text-sm font-bold text-muted-foreground">
              {group.label}
            </h2>
            <div className="space-y-2">
              {group.items.map((scan) => {
                const meta =
                  scan.scanType === "BARCODE"
                    ? [
                        scan.brand,
                        scan.food?.quantity ? `Paket: ${scan.food.quantity}` : null,
                        "Tarama kaydı · tüketim değil",
                      ].filter((item): item is string => Boolean(item))
                    : [
                        scan.brand,
                        scan.grams === null ? null : `~${compactNumber(scan.grams)} g`,
                        scan.calories === null ? null : `~${Math.round(scan.calories)} kcal`,
                      ].filter((item): item is string => Boolean(item));

                const body = (
                  <>
                    {scan.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={scan.imageUrl}
                        alt=""
                        className="size-14 shrink-0 rounded-xl border bg-primary/5 object-contain p-1"
                      />
                    ) : (
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-primary/5 text-primary">
                        {scan.scanType === "PHOTO" ? (
                          <Camera className="size-6" aria-hidden="true" />
                        ) : (
                          <Package className="size-6" aria-hidden="true" />
                        )}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">{scan.title}</span>
                      {meta.length > 0 && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {meta.join(" · ")}
                        </span>
                      )}
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {scan.scanType === "PHOTO" ? (
                            <Camera className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ScanBarcode className="size-3.5" aria-hidden="true" />
                          )}
                          {scan.scanType === "PHOTO" ? "Fotoğraf" : "Barkod"}
                        </span>
                        {scan.barcode && <span className="tabular-nums">{scan.barcode}</span>}
                        <span>{timeLabel(scan.scannedAt)}</span>
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </>
                );

                if (scan.scanType === "BARCODE" && scan.barcode) {
                  return (
                    <Link
                      key={scan.id}
                      href={`/meals/scan?mode=barcode&barcode=${encodeURIComponent(scan.barcode)}`}
                      aria-label={`${scan.title} ürün bilgilerini aç`}
                      className="flex min-h-[76px] items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition hover:bg-muted/30"
                    >
                      {body}
                    </Link>
                  );
                }

                return (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() => setSelectedPhotoId(scan.id)}
                    aria-label={`${scan.title} tarama bilgilerini aç`}
                    className="flex min-h-[76px] w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition hover:bg-muted/30"
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Tarama Geçmişi, Son Yediklerim, Plan Geçmişi ve İlerleme &gt; Geçmişim birbirinden ayrı veri anlamlarına sahiptir. Bu ekran yalnız tarama olaylarını gösterir.
      </p>
    </div>
  );
}
