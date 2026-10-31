import type {
  AdminAuditRecord,
  AdminUserSubscription,
  AdminUserSummary,
} from "@/infrastructure/admin/admin-client";

export type AdminReadState<T> =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; data: T };
export type UserAuditSummary = Pick<
  AdminAuditRecord,
  "id" | "action" | "module" | "riskLevel" | "createdAt" | "targetId" | "targetType"
>;
export type UserSessionSummary = { total: number };
export type DiagnosisClass =
  | "TESPİT EDİLDİ"
  | "OLASI NEDEN"
  | "SORUN TESPİT EDİLEMEDİ"
  | "DOĞRULANAMADI";
export interface UserDiagnosis {
  key: string;
  title: string;
  classification: DiagnosisClass;
  evidence: string;
}

/** Only safe account facts and existing, authorized service summaries. No health inference. */
export function userDiagnoses(
  user: AdminUserSummary,
  subscription: AdminReadState<AdminUserSubscription>,
  sessions: AdminReadState<UserSessionSummary>,
  audit: AdminReadState<UserAuditSummary[]>,
): UserDiagnosis[] {
  const checks: UserDiagnosis[] = [
    {
      key: "account",
      title: "Hesap erişimi",
      classification: user.isActive ? "SORUN TESPİT EDİLEMEDİ" : "TESPİT EDİLDİ",
      evidence: user.isActive
        ? "Hesap aktif. Bu bilgi tek başına girişin başarılı olacağını kanıtlamaz."
        : "Hesap pasif; mevcut hesap durumu uygulama erişimini engeller.",
    },
    {
      key: "email",
      title: "E-posta doğrulaması",
      classification: user.emailVerifiedAt ? "SORUN TESPİT EDİLEMEDİ" : "OLASI NEDEN",
      evidence: user.emailVerifiedAt
        ? "E-posta doğrulama kaydı mevcut."
        : "E-posta doğrulanmamış. Doğrulama isteyen akışlarda olası engeldir; diğer giriş yöntemleri hakkında sonuç çıkarılmaz.",
    },
    {
      key: "onboarding",
      title: "Başlangıç kurulumu",
      classification: user.onboardingCompleted ? "SORUN TESPİT EDİLEMEDİ" : "OLASI NEDEN",
      evidence: user.onboardingCompleted
        ? "Başlangıç kurulumu tamamlanmış."
        : "Başlangıç kurulumu tamamlanmamış; kurulum isteyen ekranlara erişim sınırlanabilir.",
    },
    {
      key: "login",
      title: "Son giriş",
      classification: "DOĞRULANAMADI",
      evidence: user.lastLoginAt
        ? `Son kayıtlı giriş: ${user.lastLoginAt}. Güncel bir giriş denemesi veya hata nedeni izlenmiyor.`
        : "Son giriş kaydı yok. Hiç giriş denenmediği veya giriş yapılamadığı sonucu çıkarılamaz.",
    },
  ];
  const unavailable = (status: string, label: string) =>
    status === "loading"
      ? `${label} yükleniyor; henüz doğrulanamadı.`
      : status === "unavailable"
        ? `${label} için gerekli yetki yok veya bu hesap türünde desteklenmiyor.`
        : `${label} alınamadı; diğer bölümler kullanılabilir.`;
  checks.push(
    sessions.status === "ready"
      ? {
          key: "sessions",
          title: "Oturumlar",
          classification: "SORUN TESPİT EDİLEMEDİ",
          evidence: `${sessions.data.total} aktif yenileme oturumu kayıtlı. Bu sayı güncel cihaz bağlantısını veya giriş başarısını kanıtlamaz.`,
        }
      : {
          key: "sessions",
          title: "Oturumlar",
          classification: "DOĞRULANAMADI",
          evidence: unavailable(sessions.status, "Oturum bilgileri"),
        },
  );
  if (subscription.status !== "ready")
    checks.push({
      key: "subscription",
      title: "Abonelik tutarlılığı",
      classification: "DOĞRULANAMADI",
      evidence: unavailable(subscription.status, "Abonelik bilgileri"),
    });
  else {
    const value = subscription.data;
    const support = value.supportEntitlement;
    const supported =
      value.currentPlanSource === "ADMIN_SUPPORT" &&
      support?.status === "ACTIVE" &&
      support.tier === value.currentPlan;
    const expected =
      supported ||
      (value.currentPlanSource !== "ADMIN_SUPPORT" && value.currentPlan === value.providerPlan);
    checks.push({
      key: "subscription",
      title: "Abonelik tutarlılığı",
      classification: expected ? "SORUN TESPİT EDİLEMEDİ" : "OLASI NEDEN",
      evidence: expected
        ? supported
          ? "Etkin plan farklılığı, sunucunun bildirdiği aktif destek hakkıyla açıklanıyor."
          : "Sunucunun bildirdiği etkin plan ve sağlayıcı planı tutarlı."
        : "Bildirilen etkin plan, sağlayıcı planı veya destek kaynağıyla açıklanamıyor. Bu bir ödeme hatası kanıtı değildir; abonelik bölümünden incelenmeli.",
    });
  }
  checks.push(
    audit.status === "ready"
      ? {
          key: "audit",
          title: "Yönetici etkisi",
          classification: audit.data.length ? "TESPİT EDİLDİ" : "DOĞRULANAMADI",
          evidence: audit.data.length
            ? `${audit.data.length} görünür yakın işlem kaydı var. Yalnız aşağıdaki gerçek olaylar doğrulanmıştır; güncel bir sorunun nedeni olduğu varsayılmaz.`
            : "Görüntülenebilir yakın kayıt bulunamadı. Admin müdahalesi olmadığı sonucu çıkarılamaz.",
        }
      : {
          key: "audit",
          title: "Yönetici etkisi",
          classification: "DOĞRULANAMADI",
          evidence: unavailable(audit.status, "İşlem geçmişi"),
        },
  );
  return checks;
}
