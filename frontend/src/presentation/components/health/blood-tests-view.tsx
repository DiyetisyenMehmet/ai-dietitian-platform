"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Loader2, Trash2, Upload } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { getBiomarkerEducation } from "@/presentation/components/health/blood-biomarker-education";
import {
  useBloodTests,
  bloodTestStore,
  type BloodTestSummaryView,
} from "@/application/health/blood-test-store";
import { journeyStore } from "@/application/health/journey-store";
import { useSubscription } from "@/application/payments/subscription-store";
import { ApiError } from "@/infrastructure/api/http-client";
import type {
  BloodTestNormalizedValue,
  BloodTestValueStatus,
} from "@/infrastructure/tracking/blood-test-client";

const STATUS_LABELS: Record<BloodTestValueStatus, string> = {
  NORMAL: "Normal",
  LOW: "Düşük",
  HIGH: "Yüksek",
  CRITICALLY_LOW: "Kritik düşük",
  CRITICALLY_HIGH: "Kritik yüksek",
  UNKNOWN: "Referans değerlendirilemedi",
};

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

function referenceText(value: BloodTestNormalizedValue): string {
  const range = value.referenceRange;
  if (!range) return "Referans aralığı değerlendirilemedi";
  const unit = range.unit ? ` ${range.unit}` : "";
  if (range.minValue != null && range.maxValue != null) {
    return `${range.minValue}–${range.maxValue}${unit}`;
  }
  if (range.minValue != null) return `≥ ${range.minValue}${unit}`;
  if (range.maxValue != null) return `≤ ${range.maxValue}${unit}`;
  return "Referans aralığı değerlendirilemedi";
}

function valueStatusClass(status: BloodTestValueStatus): string {
  if (status === "NORMAL") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "CRITICALLY_LOW" || status === "CRITICALLY_HIGH") {
    return "bg-destructive/10 text-destructive";
  }
  if (status === "LOW" || status === "HIGH") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  return "bg-muted text-muted-foreground";
}

function ResultBadges({ test }: { test: BloodTestSummaryView }) {
  if (test.status !== "analyzed") return null;

  if (test.flaggedCount === 0 && test.unknownCount === 0) {
    return (
      <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        Referans dışı değer saptanmadı
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {test.flaggedCount > 0 && (
        <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          {test.flaggedCount} değer referans aralığı dışında
        </span>
      )}
      {test.unknownCount > 0 && (
        <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {test.unknownCount} değer için referans değerlendirilemedi
        </span>
      )}
    </div>
  );
}

function PremiumValueEducation({
  value,
  explanation,
}: {
  value: BloodTestNormalizedValue;
  explanation?: string;
}) {
  const education = getBiomarkerEducation(value);
  if (!education && !explanation) return null;

  const isFlagged =
    value.status === "LOW" ||
    value.status === "HIGH" ||
    value.status === "CRITICALLY_LOW" ||
    value.status === "CRITICALLY_HIGH";

  return (
    <details className="group/value mt-3 rounded-lg border bg-muted/20" open={isFlagged}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold [&::-webkit-details-marker]:hidden">
        <span>Bu parametreyi açıkla</span>
        <ChevronDown
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/value:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-3 border-t px-3 py-3 text-xs leading-relaxed">
        {education && (
          <>
            <div>
              <p className="font-semibold text-foreground">Bu test nedir?</p>
              <p className="mt-1 text-muted-foreground">{education.whatItMeasures}</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Neden bakılır, ne işe yarar?</p>
              <p className="mt-1 text-muted-foreground">{education.whyItMatters}</p>
            </div>
          </>
        )}
        {explanation && (
          <div className="rounded-lg bg-primary/5 p-2.5">
            <p className="font-semibold text-primary">Sizin sonucunuzun açıklaması</p>
            <p className="mt-1 text-muted-foreground">{explanation}</p>
          </div>
        )}
      </div>
    </details>
  );
}

function AnalysisDetails({
  test,
  premiumDetails,
}: {
  test: BloodTestSummaryView;
  premiumDetails: boolean;
}) {
  const hasDetails =
    test.normalizedValues.length > 0 ||
    test.nutritionImplications.length > 0 ||
    test.recommendations.length > 0;
  if (!hasDetails) return null;

  const explanationByCode = new Map(
    test.explanations.map((item) => [item.biomarkerCode, item] as const),
  );

  return (
    <details className="group rounded-2xl border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>Detaylı analizi görüntüle</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="space-y-5 border-t px-4 py-4">
        {premiumDetails && test.normalizedValues.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                Premium detay
              </span>
              <p className="text-xs font-semibold">Laboratuvar terimleri anlaşılır Türkçe ile açıklanır</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Her parametrede ne ölçüldüğünü, neden bakıldığını, sizin sonucunuzu ve raporun kendi referansını birlikte görebilirsiniz.
            </p>
          </div>
        )}

        {test.normalizedValues.length > 0 && (
          <section className="space-y-2.5">
            <div>
              <h4 className="text-sm font-bold">Ölçülen Değerler</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Değerler, raporda bulunan referans aralığına göre; bu bilgi yoksa güvenli bir referans bulunabildiğinde değerlendirilir.
              </p>
            </div>
            <ul className="space-y-2">
              {test.normalizedValues.map((value, index) => {
                const explanation = explanationByCode.get(value.biomarkerCode);
                const education = getBiomarkerEducation(value);
                const fallbackName =
                  explanation?.biomarkerName || value.biomarkerName || value.biomarkerCode;
                const displayName = education?.title || fallbackName;
                return (
                  <li
                    key={`${value.biomarkerCode}-${index}`}
                    className="rounded-xl border bg-background p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{displayName}</p>
                        {premiumDetails && education && (
                          <p className="mt-0.5 text-[11px] font-medium text-primary/80">
                            {education.category}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          valueStatusClass(value.status),
                        )}
                      >
                        {STATUS_LABELS[value.status]}
                      </span>
                    </div>

                    {premiumDetails ? (
                      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-muted/35 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Sizin sonucunuz
                          </p>
                          <p className="mt-0.5 text-sm font-bold text-foreground">
                            {value.rawValue}{value.unit ? ` ${value.unit}` : ""}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/35 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Bu rapordaki referans
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">
                            {referenceText(value)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sonuç:{" "}
                        <span className="font-medium text-foreground">
                          {value.rawValue}{value.unit ? ` ${value.unit}` : ""}
                        </span>
                        <span aria-hidden="true"> • </span>
                        Referans: {referenceText(value)}
                      </p>
                    )}

                    {premiumDetails ? (
                      <PremiumValueEducation
                        value={value}
                        explanation={explanation?.explanation}
                      />
                    ) : (
                      explanation?.explanation && (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {explanation.explanation}
                        </p>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {test.nutritionImplications.length > 0 && (
          <section className="space-y-3">
            <div>
              <h4 className="text-sm font-bold">Beslenme Açısından Önemli Bulgular</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Yalnızca ölçülen ve referans değerlendirmesi yapılabilen bulgular üzerinden beslenme desteği planlanır.
              </p>
            </div>
            <div className="space-y-3">
              {test.nutritionImplications.map((item, index) => (
                <article key={`${item.biomarkerCode}-${index}`} className="rounded-xl border bg-background p-3">
                  <h5 className="text-sm font-semibold">{item.biomarkerName || item.biomarkerCode}</h5>
                  {item.implication && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {item.implication}
                    </p>
                  )}

                  {item.possibleNutritionFactors && item.possibleNutritionFactors.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold">Beslenmeyle ilişkili olabilecek etkenler</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                        {item.possibleNutritionFactors.map((factor, factorIndex) => (
                          <li key={factorIndex}>{factor}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.suggestedFoods.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold">Beslenmede desteklenebilecek gıdalar</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                        {item.suggestedFoods.map((food, foodIndex) => (
                          <li key={foodIndex}>{food}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.foodsToLimit.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold">Gerektiğinde sınırlandırılabilecekler</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                        {item.foodsToLimit.map((food, foodIndex) => (
                          <li key={foodIndex}>{food}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.mealIdeas && item.mealIdeas.length > 0 && (
                    <div className="mt-3 rounded-lg bg-primary/5 p-2.5">
                      <p className="text-xs font-semibold text-primary">Öğün fikirleri</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                        {item.mealIdeas.map((idea, ideaIndex) => (
                          <li key={ideaIndex}>{idea}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {test.recommendations.length > 0 && (
          <section>
            <h4 className="text-sm font-bold">Öğün Planı ve Öncelikler</h4>
            <ol className="mt-2 space-y-2">
              {test.recommendations.map((recommendation, index) => (
                <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {index + 1}
                  </span>
                  <span>{recommendation}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </details>
  );
}

/** Blood-test management: real upload, validation, analysis lifecycle and history. */
export function BloodTestsView() {
  const tests = useBloodTests();
  const { subscription } = useSubscription();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const latest = tests[0];
  const premiumDetails =
    subscription.tier === "PREMIUM" || subscription.tier === "PREMIUM_PLUS";

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
                  <CardContent className="space-y-3 p-4">
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
                        "text-sm leading-relaxed text-muted-foreground",
                        test.status === "failed" && "text-destructive",
                      )}
                    >
                      {test.summary}
                    </p>

                    {test.status === "analyzed" && (
                      <AnalysisDetails test={test} premiumDetails={premiumDetails} />
                    )}

                    <div className="flex items-end justify-between gap-2 pt-1">
                      <ResultBadges test={test} />
                      <button
                        type="button"
                        onClick={() => void onRemove(test)}
                        disabled={test.status === "analyzing" || removingId === test.id}
                        className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
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

      <p className="px-3 text-center text-[11px] leading-relaxed text-muted-foreground">
        Bu değerlendirme beslenme desteği içindir; tıbbi tanı veya tedavinin yerine geçmez.
      </p>
    </div>
  );
}
