import { ApiError } from "@/infrastructure/api/http-client";

export function planError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Öğün planı işlemi tamamlanamadı. Lütfen tekrar dene.";
  const details =
    error.details && typeof error.details === "object"
      ? (error.details as { reason?: string })
      : null;
  if (error.code === "SUBSCRIPTION_REQUIRED") {
    if (details?.reason === "FREE_DURATION_RESTRICTED")
      return "Ücretsiz planda 7 günlük başlangıç planı oluşturabilirsin. 14 ve 30 günlük planlar için Premium veya Premium Plus gerekir.";
    if (details?.reason === "FREE_TRIAL_EXHAUSTED")
      return "Ücretsiz başlangıç planı hakkını kullandın. Yeni plan oluşturmak için Premium veya Premium Plus gerekir.";
    return "Bu plan işlemi için Premium veya Premium Plus gerekir.";
  }
  if (error.code === "WEIGHT_CHECK_IN_REQUIRED")
    return "Haftalık kilo check-inin gerekli. İlerleme sayfasında güncel kilonu kaydettikten sonra plan oluşturabilirsin.";
  if (error.code === "CONSENT_REQUIRED")
    return "Plan oluşturmak için güncel yasal onaylarını tamamlaman gerekiyor.";
  if (error.code === "NUTRITION_PLAN_SAFETY_REVIEW_REQUIRED")
    return "Otomatik plan oluşturmadan önce profilini bir sağlık veya beslenme uzmanıyla değerlendirmen gerekiyor.";
  if (error.code === "NUTRITION_PLAN_GENERATION_IN_PROGRESS")
    return "Öğün planın hazırlanıyor. İşlem tamamlanana kadar lütfen bekle.";
  if (error.code === "NUTRITION_PLAN_DAY_STALE")
    return "Plan günü değişmiş. Güncel plan yeniden yüklendikten sonra tekrar deneyebilirsin.";
  if (
    [
      "NUTRITION_PLAN_INCOMPLETE",
      "AI_PROVIDER_INCOMPLETE",
      "AI_PROVIDER_MALFORMED",
      "AI_PROVIDER_EMPTY",
    ].includes(error.code ?? "")
  )
    return "Planın tüm günleri güvenilir şekilde oluşturulamadı. Lütfen tekrar dene.";
  if (
    [
      "NUTRITION_PLAN_MEAL_STRUCTURE_MISMATCH",
      "NUTRITION_PLAN_ALLERGEN_VALIDATION_FAILED",
      "NUTRITION_PLAN_TARGET_MISMATCH",
      "NUTRITION_PLAN_REALISM_VALIDATION_FAILED",
    ].includes(error.code ?? "")
  )
    return "Hazırlanan plan gerekli kontrollerden geçemedi ve kaydedilmedi. Lütfen tekrar dene.";
  if (error.status === 429 || error.code === "AI_QUOTA_EXCEEDED")
    return "Öğün planı oluşturma limitine ulaştın. Daha sonra tekrar deneyebilirsin.";
  if (error.status === 0 || error.status === 408 || error.status === 504)
    return "Bağlantı kesildi veya işlem süresi doldu. Planın oluşup oluşmadığını sayfayı yenileyerek kontrol edebilirsin.";
  if (
    [
      "AI_NOT_CONFIGURED",
      "VERTEX_CREDENTIALS_UNAVAILABLE",
      "AI_PROVIDER_ERROR",
      "AI_PROVIDER_UNREACHABLE",
      "AI_PROVIDER_BLOCKED",
    ].includes(error.code ?? "") ||
    error.status === 503
  )
    return "Plan oluşturma hizmetine şu anda ulaşılamıyor. Lütfen daha sonra tekrar dene.";
  return "Öğün planı işlemi tamamlanamadı. Lütfen tekrar dene.";
}
