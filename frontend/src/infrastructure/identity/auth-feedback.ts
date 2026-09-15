const messages: Record<string, string> = {
  "auth/unauthorized-domain": "Bu adres için giriş henüz etkin değil. Lütfen destek ekibine bildirin.",
  "auth/popup-closed-by-user": "Google giriş penceresi kapatıldı. Yeniden deneyebilirsiniz.",
  "auth/popup-blocked": "Tarayıcınız giriş penceresini engelledi. Açılır pencerelere izin verip tekrar deneyin.",
  "auth/cancelled-popup-request": "Bir giriş işlemi zaten devam ediyor.",
  "auth/operation-not-allowed": "Bu giriş yöntemi şu anda kullanılamıyor.",
  "auth/invalid-api-key": "Giriş hizmeti yapılandırılamadı. Lütfen destek ekibine bildirin.",
  "auth/invalid-credential": "Kimlik doğrulanamadı. Lütfen giriş işlemini yeniden başlatın.",
  "auth/network-request-failed": "Giriş hizmetine ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
  "auth/invalid-phone-number": "Seçtiğiniz ülke için geçerli, SMS alabilen bir cep telefonu numarası girin.",
  "auth/invalid-verification-code": "SMS kodu hatalı. Altı haneli kodu kontrol edin.",
  "auth/code-expired": "SMS kodunun süresi doldu. Yeni bir kod isteyin.",
  "auth/session-expired": "Doğrulama süresi doldu. Yeni bir SMS kodu isteyin.",
  "auth/captcha-check-failed": "Güvenlik doğrulaması tamamlanamadı. Lütfen tekrar deneyin.",
  "auth/invalid-app-credential": "Güvenlik doğrulaması geçersiz oldu. Lütfen sayfayı yenileyip tekrar deneyin.",
  "auth/missing-app-credential": "Güvenlik doğrulaması başlatılamadı. Lütfen sayfayı yenileyip tekrar deneyin.",
  "auth/app-not-authorized": "Bu adres için telefonla giriş henüz etkin değil. Lütfen destek ekibine bildirin.",
  "auth/billing-not-enabled": "SMS hizmeti proje yapılandırması nedeniyle kullanılamıyor. Lütfen destek ekibine bildirin.",
  "auth/error-code:-39": "SMS gönderimi güvenlik veya bölge politikası nedeniyle reddedildi. Lütfen biraz sonra tekrar deneyin.",
  "auth/internal-error": "SMS hizmetinde geçici bir sorun oluştu. Lütfen daha sonra tekrar deneyin.",
  "auth/too-many-requests": "Çok fazla deneme yapıldı. Bir süre bekleyip tekrar deneyin.",
  "auth/quota-exceeded": "SMS hizmeti şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
  "auth/configuration-unavailable": "Giriş hizmeti şu anda hazır değil. Lütfen daha sonra tekrar deneyin.",
  EXTERNAL_AUTH_UNAVAILABLE: "Giriş hizmeti şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
  UNAUTHORIZED: "Kimlik doğrulanamadı. Lütfen giriş işlemini yeniden başlatın.",
  FORBIDDEN: "Bu hesapla giriş yapılamıyor. Lütfen destek ekibiyle iletişime geçin.",
};

export function authErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    && typeof error.code === "string" ? error.code : "unknown";
  // Preserve diagnostic codes, never tokens, phone numbers or upstream messages.
  // A primitive string stays readable in browser/Cloud diagnostics while
  // keeping phone numbers, tokens and upstream error messages out of logs.
  console.warn(`[identity] authentication failed code=${code}`);
  return messages[code] ?? "Giriş işlemi tamamlanamadı. Lütfen tekrar deneyin.";
}
