# Changelog

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenir.
Format [Keep a Changelog](https://keepachangelog.com/) temel alınır ve proje [Semantic Versioning](https://semver.org/lang/tr/) izler.

---

## [Unreleased]

### Added
- **Sprint 15 — Ödeme Entegrasyonu, Abonelik Yönetimi, Yasal Uyumluluk ve Üretim Hazırlığı (backend):** Üretime çıkış blocker'larının kapatılması — iyzico ödeme entegrasyonu, abonelik yönetimi, KVKK dâhil yasal uyumluluk ve eksik Prisma migration'larının üretilmesi.
  - **Ödeme entegrasyonu (iyzico):** Yeni `payments` modülü — sağlayıcı-bağımsız `PaymentProvider` arayüzü ve iyzico uygulaması (IYZWSv2 HMAC-SHA256 kimlik doğrulama, harici npm bağımlılığı olmadan yerleşik `crypto` + global `fetch`). Checkout başlatma, sağlayıcı ile ödeme doğrulama/tamamlama ve **güvenli webhook doğrulaması** (imza doğrulama, sabit-zamanlı karşılaştırma, imzasız gizli anahtarda fail-closed, `PaymentWebhookEvent.providerEventId` ile idempotent tekrar-koruması, bildirim gövdesine asla güvenmeden sağlayıcı ile yeniden doğrulama). Endpoint'ler: `POST /api/payments/checkout`, `POST /api/payments/verify`, `GET /api/payments`, `POST /api/payments/webhook` (public).
  - **Abonelik yönetimi:** `SubscriptionTier` enum `PRO` → **`PREMIUM_PLUS`** olarak yeniden adlandırıldı (Free / Premium / Premium Plus). Plan kataloğu (tutarlar kuruş cinsinden `Int`), `Subscription`/`Payment` modelleri, durum yaşam döngüsü (`PENDING`/`ACTIVE`/`PAST_DUE`/`CANCELED`/`EXPIRED`), `User.subscriptionTier` ile senkron tutma, dönem-sonu iptali. Endpoint'ler: `GET /api/subscription/plans` (public), `GET /api/subscription`, `POST /api/subscription/cancel`.
  - **Özellik erişim kontrolü:** Tier-bazlı yetkilendirme (`entitlements`) ve yeniden kullanılabilir middleware altyapısı — `requireFeature`/`requireTier` (403 `SUBSCRIPTION_REQUIRED`) ve `requireConsent` (403 `CONSENT_REQUIRED`). Mevcut Sprint 12–14 rotaları değiştirilmedi (hacim kotası zaten Sprint 14 kota matrisi ile uygulanıyor); gating altyapı olarak sunuldu ve frontend için durum endpoint'leri açıldı.
  - **Yasal uyumluluk (KVKK):** Yeni `legal` modülü — sürümlenmiş Türkçe **Gizlilik Politikası**, **Kullanım Koşulları**, **Tıbbi Sorumluluk Reddi** ve **KVKK Açık Rıza Metni**; append-only `ConsentRecord` (kullanıcı başına tür bazında en güncel kayıt, sürüm damgalı), zorunlu onay akışı ve geri çekme hakkı. Endpoint'ler: `GET /api/legal/documents` + `/documents/:type` (public), `GET /api/legal/consents`, `POST /api/legal/consents`, `POST /api/legal/consents/withdraw`. Yeni denetim eylemleri (`SUBSCRIPTION_*`, `PAYMENT_*`, `CONSENT_GRANTED`/`CONSENT_WITHDRAWN`).
  - **Hesap silme uyumluluğu:** Yeni modeller (`Subscription`/`Payment`/`ConsentRecord`) `User` silindiğinde `onDelete: Cascade` ile temizlenir; `PaymentWebhookEvent` kullanıcı FK'si taşımaz. Mevcut hesap silme akışı değişiklik gerektirmedi.
  - **Üretim hazırlığı / migration'lar:** Yalnızca Sprint 11'e kadar mevcut olan migration'lar tamamlandı — Sprint 12–14 için catch-up migration'ı (`20260715230225_catch_up_sprint12_13_14_ai_domains`) ve Sprint 15 şeması (`20260715231500_sprint15_subscriptions_payments_legal`) üretildi; yerel bir Postgres shadow veritabanına `prisma migrate deploy` ile temiz uygulandığı doğrulandı. Yeni env değişkenleri (`PAYMENT_PROVIDER`, `IYZICO_*`, `BILLING_CURRENCY`, `LEGAL_*`) `env.ts` ve `.env.example`'a eklendi; webhook imza doğrulaması için ham gövde (`req.rawBody`) yakalandı.
- **Sprint 14 — AI Diyetisyen Sohbeti + AI Kullanım Kotası (backend):** Üretim kalitesinde AI Diyetisyen Chat orkestratörü (C2) ve abonelik-farkında AI kullanım kotası/maliyet koruması (C5).
  - **AI Chat (C2):** Yeni `ai-chat` modülü — kalıcı konuşma/mesaj (Prisma `ChatConversation` + `ChatMessage`, `ChatRole` enum), orkestrasyon hattı: kota kontrolü → PHI-minimize edilmiş bağlam üretimi → sağlayıcı-bağımsız AI adaptörü → turu kaydet → kullanımı işle. Endpoint'ler: `POST /api/ai-chat/messages`, `GET /api/ai-chat/conversations`, `GET /api/ai-chat/conversations/:id`, `DELETE /api/ai-chat/conversations/:id`.
  - **PHI minimizasyonu (AD-039):** Harici AI çağrılarında yalnızca türetilmiş, kimliksiz bağlam gönderilir (yaş; doğum tarihi/ad/e-posta/kullanıcı id ASLA); serbest metin mesajlarında e-posta/telefon/uzun numara/URL maskeleme (`redactPii`). Kullanıcının orijinal metni Diewish veritabanında saklanır; maskeleme yalnızca giden kopyaya uygulanır.
  - **AI Kullanım Kotası (C5):** Yeni `ai-usage` modülü — tier×özellik×pencere (günlük/aylık) kota matrisi, `SubscriptionTier` enum (`FREE`/`PREMIUM`/`PRO`, `User.subscriptionTier` varsayılan FREE), append-only `AiUsageEvent` (kota + maliyet audit), `aiUsageService.assertWithinQuota` (aşımda 429) ve `GET /api/ai-usage` görünürlük endpoint'i. Bu sprint yalnızca `DIETITIAN_CHAT` için uygulanır; diğer AI özellikleri şemayı değiştirmeden aynı yeteneği benimseyebilir.
  - **Yeniden kullanım:** Sprint 12 sağlayıcı-bağımsız AI adaptörü tekrar kullanıldı (`chatWithDietitian` metodu eklendi); güvenlik (teşhis/tedavi yok, DISCLAIMER, yasaklı terim guard'ı) Sprint 12'den paylaşıldı. Ödeme/abonelik sistemi (Sprint 15) kapsam dışı bırakıldı — yalnızca tier alanı/enum'u ileriye dönük eklendi.
- **Sprint 11 — Kan Tahlili Yükleme Altyapısı (backend):** Kullanıcıların PDF laboratuvar raporu veya yüksek kaliteli görsel yükleyebildiği, production-kalite güvenli dosya yükleme altyapısı (AI analizi bir sonraki sprint'te bu altyapıyı değişiklik gerektirmeden tüketecek şekilde tasarlandı).
  - Prisma `BloodTestUpload` modeli (kullanıcıya `onDelete: Cascade` bağlı, checksum + metadata alanları), `BloodTestStatus` enum'ı (`UPLOADED` kullanılıyor; `ANALYZING`/`ANALYZED`/`FAILED` AI için ileriye dönük ayrıldı), `AuditAction`'a `BLOOD_TEST_UPLOADED`/`BLOOD_TEST_REPLACED`/`BLOOD_TEST_DELETED` değerleri ve migration (`20260715210742_add_blood_test_uploads`).
  - Sağlayıcı-bağımsız depolama soyutlaması (`StorageProvider` arayüzü + `LocalStorageProvider`; `STORAGE_PROVIDER` env ile seçilir, ileride S3 vb. eklenebilir), path-traversal korumalı yerel depolama.
  - BloodTest modülü (DDD): `schemas` (Zod; metadata + param), `repository` (sahiplik-kapsamlı sorgular), `service` (magic-byte tip doğrulama, sha256 checksum, rollback'li yükleme), `controller`, `routes`.
  - Endpoint'ler: `POST /api/blood-tests` (yükleme), `GET /api/blood-tests` (geçmiş), `GET /api/blood-tests/:id` (metadata), `GET /api/blood-tests/:id/file` (indirme), `PUT /api/blood-tests/:id/file` (değiştirme), `DELETE /api/blood-tests/:id` (silme); Swagger'a `BloodTests` tag'i.
  - Güvenlik: `multer` memory storage + boyut limiti (`BLOOD_TEST_MAX_FILE_SIZE_MB`, varsayılan 15MB) + tek dosya limiti, magic-byte ile gerçek MIME doğrulama (PDF/JPEG/PNG/WebP), rastgele UUID storage key (orijinal ad yalnızca gösterim/indirme için), kullanıcı bazlı sahiplik-kapsamı (yetkisiz erişimde varlık sızdırmayan 404), tüm yaşam döngüsü işlemleri için denetim günlüğü.
- **Sprint 10 — Hesap Yaşam Döngüsü (backend):** E-posta doğrulama, şifre sıfırlama/değiştirme ve hesap silme akışlarının uçtan uca uygulanması.
  - Prisma `AccountToken` (tek kullanımlık, süreli token; yalnızca SHA-256 hash saklanır) + `AuditLog` (silme sonrası da kalan, FK'siz denetim kaydı) modelleri, `AccountTokenType`/`AuditAction` enum'ları, `User.deletionRequestedAt` alanı ve migration (`20260715205703_add_account_lifecycle`).
  - Account modülü (DDD): `account.schemas` (Zod), `repository` (guard'lı `usedAt: null` ile yarış-güvenli tek kullanım, atomik transaction'lar), `service`, `controller`, `routes`.
  - Endpoint'ler: `POST /api/account/email/verify/request` + `/email/verify/confirm`, `/password/forgot` + `/password/reset` + `/password/change`, `/deletion/request` + `/deletion/cancel`, `DELETE /api/account`; Swagger'a `Account` tag'i.
  - Güvenlik: 256-bit opak token'lar, token süre dolumu + tek kullanım, hesap-enumerasyonu önleyen tek-tip yanıtlar, yıkıcı işlemlerde şifre ile yeniden kimlik doğrulama, şifre sıfırlama/değiştirmede tüm oturumların iptali, güvenlik olayları için denetim günlüğü.
  - E-posta teslimi için sağlayıcı-bağımsız `mailer` soyutlaması (dev'de log transport; production sağlayıcı entegrasyonu sonraki sprint'e bırakıldı).
- **Sprint 9 — Zorunlu Kullanıcı Onboarding'i:** Kayıt/giriş sonrası, uygulama özelliklerine erişimden önce tamamlanması zorunlu, çok adımlı onboarding akışı.
  - Prisma `UserProfile` modeli (1:1 `User`), `Gender`/`ActivityLevel`/`DietaryPreference` enum'ları ve migration (`20260715203846_add_user_profile_onboarding`).
  - Onboarding modülü (DDD): `onboarding.schemas` (Zod, yaş sınırı doğrulama), `repository` (tek transaction'da profil upsert + `onboardingCompleted` flag), `service` (doğum tarihinden yaş türetme), `controller`, `routes`.
  - Endpoint'ler: `POST /api/onboarding` (profili kaydeder ve uygulama kilidini açar), `GET /api/onboarding`; Swagger'a `Onboarding` tag'i.
  - Frontend auth entegrasyonu: localStorage tabanlı session store, HTTP client'a bearer-token ekleme + `{success,data}` envelope çözme, `authClient` (login/register/refresh/logout/me), login/register akışları backend'e bağlandı.
  - Toplanan alanlar: ad soyad, doğum tarihi (otomatik yaş), cinsiyet, boy, mevcut/hedef kilo, aktivite seviyesi, sağlık durumları, alerjiler, beslenme tercihi, günlük su hedefi.
  - Mobile-first, 5 adımlı sihirbaz (adım başı doğrulama, ilerleme çubuğu) ve global **route guard** — onboarding tamamlanana kadar tüm özellikler kilitli.
- **Sprint 8 — Authentication (backend):** Ürün adı **Diewish** altında production-kalite kimlik doğrulama altyapısı.
  - Prisma `User` + `RefreshToken` modelleri, `UserRole` enum ve migration (`20260715202355_add_auth_user_refresh_token`).
  - `bcryptjs` ile şifre hashleme (yapılandırılabilir maliyet), ayrı access/refresh JWT secret'ları, TTL ve issuer.
  - Auth modülü (DDD): `auth.schemas` (Zod DTO), `auth.repository`, `auth.service`, `auth.controller`, `auth.routes`.
  - Endpoint'ler: `POST /api/auth/register`, `/login`, `/refresh-token`, `/logout`, `GET /api/auth/me`.
  - `authenticate` + `authorize` (rol guard) middleware; auth'a özel sıkı rate limiter (brute-force koruması).
  - Refresh token **rotation + reuse detection** (yeniden kullanım tespitinde tüm oturumların iptali) ve SHA-256 token-hash saklama.
  - Swagger'a `Auth` tag'i + `bearerAuth` security scheme; modül route glob'u eklendi.
- **Ürün markası:** Geçici "AI Dietitian Platform" adı **Diewish** ile değiştirildi (README, Swagger başlığı, frontend metadata/`APP_CONFIG`, package adları, dokümanlar).
- **V1 yol haritası optimizasyonu:** `ROADMAP.md` üç kovaya göre yeniden yapılandırıldı — 🚀 Launch Blocker / 📮 Post-Launch / 🔭 Future Vision — her maddenin V1'de kalma/ertelenme gerekçesiyle.
- Proje yönetim dokümanları: `ROADMAP.md` ve `CHANGELOG.md` oluşturuldu.
- `TODO_MASTER.md` sprint bazlı takip, öncelikler (Critical/High/Medium/Low), efor tahminleri, blocker ve teknik borç bölümleriyle yeniden yapılandırıldı.
- `PROJECT_MEMORY.md`'ye tam "Güncel Proje Durumu" snapshot bölümü eklendi (sprint, commit, sürüm, modül/bileşen durumları, teknolojiler, kararlar, sonraki sprint).
- `README.md` backend, veritabanı, kalite kapıları ve deployment bilgileriyle güncellendi.

### Changed
- Dokümantasyon dört dosya (`TODO_MASTER`, `PROJECT_MEMORY`, `ROADMAP`, `CHANGELOG`) arasında senkron hale getirildi.

### Improved
- Kalite kapıları uçtan uca doğrulandı: frontend ve backend için lint, type-check ve build sıfır hata/uyarı ile geçti.
- Mimari doğrulama yapıldı: build artefaktlarının (`dist/`, `.next/`, `*.tsbuildinfo`, `node_modules/`) git'e alınmadığı, `.env` sızıntısı olmadığı, ölü kod/TODO işareti bulunmadığı teyit edildi.

### Fixed
- VM yeniden başlatması sonrası eksik PostgreSQL 17 sunucusu yeniden kuruldu; `dietitian` rolü ve `ai_dietitian` veritabanı oluşturuldu, `20260711213135_init` migration yeniden uygulandı.
- Frontend/backend geliştirme sunucuları yeniden başlatıldı; Preview URL yeniden erişilebilir (HTTP 200) hale getirildi.

### Removed
- Yok.

### Breaking Changes
- Yok.

---

## [0.1.0] — 2026-07-11

İlk temel sürüm (frontend MVP + backend foundation). Son commit: `15e4bc1`.

### Added
- **Sprint 7 — Backend Foundation** (`15e4bc1`): Express + TypeScript, Pino logging, correlation ID, standart JSON envelope, ApiError hata yönetimi, Zod env/validate middleware, PostgreSQL 17 + Prisma (HealthCheck modeli + ilk migration), health endpoint'leri (`/api/health`, `/api/health/ready`), Swagger `/docs`, CORS/Helmet/compression/rate-limit güvenlik katmanı.
- **Sprint 6 — Goals** (`7e5f519`): 8 hedef tipi, Zod validation (Türkçe), `useSyncExternalStore` state yönetimi, dashboard + detay (dairesel ilerleme, haftalık grafik) + form (unsaved-changes guard).
- **Sprint 5 — AI Chat** (`2472914`): sohbet arayüzü (frontend/mock).
- **Sprint 4 — Meals** (`f159d39`): öğün listesi + öğün ekleme.
- **Sprint 3 — Dashboard** (`ed86348`): kalori/makro görselleştiricileri.
- **Sprint 2 — Authentication (Frontend)** (`94386f6`): login, register, forgot/reset password, verify email ekranları.
- **Sprint 1 — Frontend Foundation** (`b2201eb`): Next.js 15 + App Router + TypeScript + Tailwind + shadcn/ui, katmanlı domain mimarisi, tema ve navigasyon.
- Proje dokümantasyonu ve mimari kararlar (`2e68e75`): `ARCHITECTURE_DECISIONS.md` (AD-001…AD-045), `PROJECT_MEMORY.md`, `TODO_MASTER.md`.

### Changed
- UI dil/ürün geçişleri (`eaac0f9`, `ad30451`, `736985f`): görünür "AI" ifadelerinin doğal terminolojiyle değiştirilmesi ve premium UX iyileştirmeleri.

---

[Unreleased]: https://github.com/DiyetisyenMehmet/ai-dietitian-platform/compare/15e4bc1...HEAD
[0.1.0]: https://github.com/DiyetisyenMehmet/ai-dietitian-platform/releases/tag/v0.1.0
