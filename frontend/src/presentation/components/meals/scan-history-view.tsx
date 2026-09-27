"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Clock3, Package, ScanBarcode } from "lucide-react";

import {
  nutritionClient,
  type BarcodeHistoryDto,
} from "@/infrastructure/nutrition/nutrition-client";
import { Card, CardContent } from "@/presentation/components/ui/card";

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

function displayName(scan: BarcodeHistoryDto): string {
  return scan.food?.displayNameTr || scan.food?.name || scan.productName || "Barkodlu ürün";
}

function subtitle(scan: BarcodeHistoryDto): string {
  const parts = [scan.food?.brand, scan.food?.quantity].filter(
    (item): item is string => Boolean(item?.trim()),
  );
  return parts.join(" · ");
}

export function ScanHistoryView() {
  const [scans, setScans] = React.useState<BarcodeHistoryDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void nutritionClient
      .history(50)
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

  const groups = React.useMemo(() => {
    const result: Array<{ key: string; label: string; items: BarcodeHistoryDto[] }> = [];
    for (const scan of scans) {
      const key = localDayKey(scan.scannedAt);
      const existing = result.find((group) => group.key === key);
      if (existing) {
        existing.items.push(scan);
      } else {
        result.push({ key, label: dateLabel(scan.scannedAt), items: [scan] });
      }
    }
    return result;
  }, [scans]);

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

  if (scans.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock3 className="size-6" aria-hidden="true" />
          </span>
          <h2 className="mt-3 font-bold">Henüz tarama geçmişin yok</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Barkodla bulduğun ürünler burada tarihleriyle listelenir.
          </p>
          <Link
            href="/meals/scan?mode=barcode"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Barkod tara
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ScanBarcode className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold">Taradığın ürünler</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Bu liste yalnız Besin Tarayıcı geçmişidir. Bir ürünü taraman, onu yediğin anlamına gelmez ve İlerleme &gt; Geçmişim kayıtlarına eklenmez.
            </p>
          </div>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.key} className="space-y-2" aria-labelledby={`scan-day-${group.key}`}>
          <h2 id={`scan-day-${group.key}`} className="px-1 text-sm font-bold text-muted-foreground">
            {group.label}
          </h2>
          <div className="space-y-2">
            {group.items.map((scan, index) => {
              const href = `/meals/scan?mode=barcode&barcode=${encodeURIComponent(scan.barcode)}`;
              const meta = subtitle(scan);
              return (
                <Link
                  key={`${scan.barcode}-${scan.scannedAt}-${index}`}
                  href={href}
                  aria-label={`${displayName(scan)} ürün bilgilerini aç`}
                  className="flex min-h-[76px] items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition hover:bg-muted/30"
                >
                  {scan.food?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scan.food.imageUrl}
                      alt=""
                      className="size-14 shrink-0 rounded-xl border bg-primary/5 object-contain p-1"
                    />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-primary/5 text-primary">
                      <Package className="size-6" aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">
                      {displayName(scan)}
                    </span>
                    {meta && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {meta}
                      </span>
                    )}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Barkod</span>
                      <span className="tabular-nums">{scan.barcode}</span>
                      <span>{timeLabel(scan.scannedAt)}</span>
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
