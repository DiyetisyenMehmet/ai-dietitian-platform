"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Trash2, Upload } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useBloodTests, bloodTestStore } from "@/application/health/blood-test-store";
import { journeyStore } from "@/application/health/journey-store";
import type { BloodTestSummary } from "@/domain/health/types";

function StatusBadge({ test }: { test: BloodTestSummary }) {
  if (test.status === "analyzing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Analiz ediliyor
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      Analiz tamamlandı
    </span>
  );
}

/** Blood-test management: upload, track analysis status and review history. */
export function BloodTestsView() {
  const tests = useBloodTests();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const latest = tests[0];
  const onPick = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const okType = /(pdf|image|jpeg|jpg|png)/i.test(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!okType) {
      toast.error("PDF veya görsel bir dosya seç (PDF, JPG, PNG).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Dosya 10 MB'den küçük olmalı.");
      return;
    }
    bloodTestStore.upload(file.name);
    journeyStore.add({
      type: "blood-test",
      title: "Kan tahlili yüklendi",
      description: file.name,
    });
    toast.success("Tahlil yüklendi", {
      description: "Koçun sonuçlarını analiz ediyor; birkaç saniye içinde hazır olacak.",
    });
  }, []);

  const onRemove = React.useCallback((id: string) => {
    bloodTestStore.remove(id);
    toast.success("Tahlil silindi.");
  }, []);

  return (
    <div className="space-y-5">
      {/* Intro / upload */}
      <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent to-background p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            {React.createElement(healthIcon("flask"), { className: "size-6", "aria-hidden": true })}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold">Kan Tahlilleri</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Tahlil sonuçlarını yükle; koçun kan değerlerine göre önerilerini kişiselleştirsin.
            </p>
          </div>
        </div>
        {latest && (
          <p className="mt-3 text-xs text-muted-foreground">
            Son yükleme: {formatLongDate(new Date(latest.date))}
          </p>
        )}
        <Button className="mt-4 w-full" onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden="true" />
          Yeni tahlil yükle
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          className="sr-only"
          onChange={onPick}
        />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          PDF, JPG veya PNG • en fazla 10 MB
        </p>
      </section>

      {/* History */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold">Geçmiş Analizler</h3>
        {tests.length === 0 ? (
          <Card>
            <CardContent className="p-5">
              <EmptyState
                icon={healthIcon("flask")}
                title="Henüz kan tahlili yok"
                description="İlk tahlilini yüklediğinde koçun daha kişisel öneriler sunabilir. Sonuçlarını burada güvenle saklarız."
                action={{ label: "İlk tahlilini yükle", onClick: () => fileInputRef.current?.click() }}
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {tests.map((test) => (
              <li key={test.id}>
                <Card className={cn(test.status === "analyzing" && "opacity-90")}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{test.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatLongDate(new Date(test.date))}
                        </p>
                      </div>
                      <StatusBadge test={test} />
                    </div>
                    <p className="text-sm text-muted-foreground">{test.summary}</p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      {test.status === "analyzed" && test.flaggedCount > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {test.flaggedCount} değer takip gerektiriyor
                        </span>
                      ) : test.status === "analyzed" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          Tüm değerler normal aralıkta
                        </span>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => onRemove(test.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`${test.title} tahlilini sil`}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Sil
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 text-center text-xs text-muted-foreground">
        Yüklediğin veriler bu cihazda saklanır ve yalnızca sana özel öneriler üretmek için kullanılır.
        Bu bir tıbbi teşhis değildir.
      </p>
    </div>
  );
}
