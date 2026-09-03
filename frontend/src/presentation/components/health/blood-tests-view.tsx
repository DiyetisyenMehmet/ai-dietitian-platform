"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2, Upload } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { healthIcon } from "@/presentation/components/health/health-icon";
import {
  useBloodTests,
  bloodTestStore,
  type BloodTestSummaryView,
} from "@/application/health/blood-test-store";
import { journeyStore } from "@/application/health/journey-store";
import { ApiError } from "@/infrastructure/api/http-client";

function StatusBadge({ test }: { test: BloodTestSummaryView }) {
  if (test.status === "analyzing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Analiz ediliyor
      </span>
    );
  }
  if (test.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
        <AlertTriangle className="size-3" aria-hidden="true" />
        Analiz başarısız
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      Analiz tamamlandı
    </span>
  );
}

function friendlyUploadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "SUBSCRIPTION_REQUIRED") {
      return "Ücretsiz kan tahlili analiz hakkın doldu. Devam etmek için plan seçeneklerini inceleyebilirsin.";
    }
    if (error.code === "NOT_A_BLOOD_TEST" || error.code === "BLOOD_TEST_VALIDATION_FAILED") {
      return error.message || "Bu dosya okunabilir bir laboratuvar kan tahlili olarak doğrulanamadı.";
    }
    if (error.status === 413) return "Dosya çok büyük. En fazla 15 MB yükleyebilirsin.";
    if (error.status === 429) return "Analiz kullanım limitine ulaştın. Lütfen daha sonra tekrar dene.";
    return error.message;
  }
  return "Kan tahlili yüklenemedi veya analiz tamamlanamadı. Lütfen tekrar dene.";
}

/** Blood-test management: real upload, validation, analysis lifecycle and history. */
export function BloodTestsView() {
  const tests = useBloodTests();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const latest = tests[0];

  // The backend/Neon is the source of truth. Reload persisted analysis history
  // whenever this page mounts so a browser refresh never loses completed/failed
  // results and an old PROCESSING card cannot survive only in client memory.
  React.useEffect(() => {
    void bloodTestStore.hydrateBloodTestsFromBackend();
  }, []);

  const onPick = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;

    const okType = /(pdf|image|jpeg|jpg|png)/i.test(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!okType) {
      toast.error("PDF veya görsel bir dosya seç (PDF, JPG, PNG).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Dosya 15 MB'den küçük olmalı.");
      return;
    }

    setUploading(true);
    try {
      const result = await bloodTestStore.uploadAndAnalyze(file);
      if (result.status === "analyzed") {
        journeyStore.add({
          type: "blood-test",
          title: "Kan tahlili analiz edildi",
          description: file.name,
        });
        toast.success("Kan tahlili analizi tamamlandı.");
      }
    } catch (error) {
      toast.error("Analiz tamamlanamadı", { description: friendlyUploadError(error) });
    } finally {
      setUploading(false);
    }
  }, [uploading]);

  const onRemove = React.useCallback(async (test: BloodTestSummaryView) => {
    if (removingId) return;
    setRemovingId(test.id);
    try {
      await bloodTestStore.remove(test);
      toast.success("Tahlil silindi.");
    } catch (error) {
      toast.error("Tahlil silinemedi", {
        description: error instanceof ApiError ? error.message : "Lütfen tekrar dene.",
      });
    } finally {
      setRemovingId(null);
    }
  }, [removingId]);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent to-background p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            {React.createElement(healthIcon("flask"), { className: "size-6", "aria-hidden": true })}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold">Kan Tahlilleri</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Tahlil dosyan önce gerçek bir laboratuvar raporu olup olmadığı açısından doğrulanır;
              doğrulandıktan sonra değerler çıkarılır ve beslenme odaklı açıklama hazırlanır.
            </p>
          </div>
        </div>
        {latest && (
          <p className="mt-3 text-xs text-muted-foreground">
            Son kayıt: {formatLongDate(new Date(latest.date))}
          </p>
        )}
        <Button
          className="mt-4 w-full"
          onClick={() => fileInputRef.current?.click()}
          isLoading={uploading}
          disabled={uploading}
        >
          {!uploading && <Upload aria-hidden="true" />}
          {uploading ? "Yükleniyor ve analiz ediliyor" : "Yeni tahlil yükle"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/jpeg,image/png"
          className="sr-only"
          onChange={(event) => void onPick(event)}
        />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          PDF, JPG veya PNG • en fazla 15 MB
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Geçmiş Analizler</h3>
        {tests.length === 0 ? (
          <Card>
            <CardContent className="p-5">
              <EmptyState
                icon={healthIcon("flask")}
                title="Henüz kan tahlili yok"
                description="İlk laboratuvar tahlilini yüklediğinde doğrulama ve analiz sonucu burada görünecek."
                action={{ label: "İlk tahlilini yükle", onClick: () => fileInputRef.current?.click() }}
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {tests.map((test) => (
              <li key={test.id}>
                <Card
                  className={cn(
                    test.status === "analyzing" && "opacity-90",
                    test.status === "failed" && "border-destructive/30",
                  )}
                >
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
                    <p
                      className={cn(
                        "text-sm text-muted-foreground",
                        test.status === "failed" && "text-destructive",
                      )}
                    >
                      {test.summary}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      {test.status === "analyzed" && test.flaggedCount > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {test.flaggedCount} değer referans aralığı dışında
                        </span>
                      ) : test.status === "analyzed" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          Referans dışı değer saptanmadı
                        </span>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => void onRemove(test)}
                        disabled={test.status === "analyzing" || removingId === test.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`${test.title} tahlilini sil`}
                      >
                        {removingId === test.id ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        )}
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
        Sonuçlar eğitim ve beslenme desteği içindir; tıbbi teşhis veya hekim değerlendirmesinin yerine geçmez.
      </p>
    </div>
  );
}
