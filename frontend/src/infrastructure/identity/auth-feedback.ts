const messages: Record<string, string> = {
  "auth/unauthorized-domain": "Bu adres için giriş henüz etkin değil. Lütfen destek ekibine bildirin.",
  "auth/popup-closed-by-user": "Google giriş penceresi kapatıldı. Yeniden deneyebilirsiniz.",
  "auth/popup-blocked": "Tarayıcınız giriş penceresini engelledi. Açılır pencerelere izin verip tekrar deneyin.",
  "auth/cancelled-popup-request": "Bir giriş işlemi zaten devam ediyor.",
  "auth/operation-not-allowed": "Bu giriş yöntemi şu anda kullanılamıyor.",
  "auth/invalid-api-key": "Giriş hizmeti yapılandırılamadı. Lütfen destek ekibine bildirin.",
  "auth/invalid-credential": "Kimlik doğrulanamadı. Lütfen giriş işlemini yeniden başlatın.",
  "auth/network-request-failed": "Giriş hizmetine ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
  "auth/invalid-phone-number": "Geçerli bir Türkiye cep telefonu numarası girin. Örnek: 05xx xxx xx xx.",
  "auth/invalid-verification-code": "SMS kodu hatalı. Altı haneli kodu kontrol edin.",
  "auth/code-expired": "SMS kodunun süresi doldu. Yeni bir kod isteyin.",
  "auth/session-expired": "Doğrulama süresi doldu. Yeni bir SMS kodu isteyin.",
  "auth/captcha-check-failed": "Güvenlik doğrulaması tamamlanamadı. Lütfen tekrar deneyin.",
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
  console.warn("[identity] authentication failed", { code });
  return messages[code] ?? "Giriş işlemi tamamlanamadı. Lütfen tekrar deneyin.";
}

export function normalizeTurkishPhone(input: string): string | null {
  const value = input.trim().replace(/[\s().-]/g, "");
  if (/^05\d{9}$/.test(value)) return `+90${value.slice(1)}`;
  if (/^5\d{9}$/.test(value)) return `+90${value}`;
  if (/^905\d{9}$/.test(value)) return `+${value}`;
  if (/^00905\d{9}$/.test(value)) return `+${value.slice(2)}`;
  return /^\+905\d{9}$/.test(value) ? value : null;
}
