"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { nutritionPlanStore, useNutritionPlan } from "@/application/health/nutrition-plan-store";
import { Button } from "@/presentation/components/ui/button";
import { planError } from "./nutrition-plan-errors";
import { ApiError } from "@/infrastructure/api/http-client";

export function NutritionPreparationStatus() {
  const { preparation: job, preparationOffline, generating } = useNutritionPlan();
  const [confirm, setConfirm] = React.useState(false),
    [pausing, setPausing] = React.useState(false);
  React.useEffect(() => {
    setConfirm(false);
  }, [job?.id]);
  if (!job) return null;
  const paused = job.status === "PAUSED";
  const pause = async () => {
    if (pausing) return;
    setPausing(true);
    try {
      await nutritionPlanStore.pausePreparation();
      setConfirm(false);
    } catch (error) {
      toast.error(planError(error));
    } finally {
      setPausing(false);
    }
  };
  return (
    <div className="rounded-2xl border border-primary/20 bg-card p-4">
      <div role="status" aria-live="polite">
        <p className="text-sm font-semibold">
          {paused
            ? "Plan oluşturma iptal edildi"
            : generating
              ? job.kind === "MEAL_CHANGE"
                ? "Öğün değişikliği hazırlanıyor"
                : `${job.totalDays} günlük planın ${job.completedDays} günü hazırlandı.`
              : "Plan hazırlığı durdu"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {paused
            ? "Plan hazırlığı durduruldu. Plan oluşturma hakkınız korunuyor. Tekrar oluşturduğunuzda uygun hazırlık verileri yeniden kullanılabilir."
            : preparationOffline
              ? "Bağlantı kurulamadı. Sunucudaki hazırlık korunuyor; bağlantı geldiğinde durum yeniden kontrol edilecek."
              : generating
                ? "Başka bir menüye geçebilirsiniz. Hazırlık durumunuz hesabınızda korunur."
                : job.status === "FAILED" || job.status === "INVALIDATED"
                  ? planError(new ApiError("", 409, job.errorCode ?? "NUTRITION_CONTEXT_CHANGED"))
                  : "Hazırlık verilerinin saklama süresi doldu. Kullanılmamış hakkınız korunuyor."}
        </p>
      </div>
      {generating && (
        <Button className="mt-3" variant="outline" size="sm" onClick={() => setConfirm(true)}>
          İptal Et
        </Button>
      )}
      <Dialog.Root
        open={confirm}
        onOpenChange={(open) => {
          if (!pausing) setConfirm(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-5 shadow-xl"
            onEscapeKeyDown={(event) => {
              if (pausing) event.preventDefault();
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <Dialog.Title className="text-base font-semibold">
              Plan hazırlığını iptal etmek istiyor musunuz?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Plan hazırlığı durdurulacak. Şimdiye kadar hazırlanmış uygun veriler korunacak. Tekrar
              plan oluşturduğunuzda kaldığınız yerden devam edebilirsiniz.
            </Dialog.Description>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                autoFocus
                variant="outline"
                disabled={pausing}
                onClick={() => setConfirm(false)}
              >
                Hazırlamaya Devam Et
              </Button>
              <Button disabled={pausing} onClick={() => void pause()}>
                Evet, İptal Et
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
