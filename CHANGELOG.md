# Changelog

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenir.
Format [Keep a Changelog](https://keepachangelog.com/) temel alınır ve proje [Semantic Versioning](https://semver.org/lang/tr/) izler.

---

## [Unreleased]

### Added
- **Sprint 19 — AI Health Coach Intelligence (backend):** Diewish'i proaktif, hafıza yeteneğine sahip ve kullanıcı verilerine göre dinamik olarak adapte olabilen akıllı bir AI Sağlık Koçu'na dönüştüren kapsamlı backend özellikleri. Tüm kullanıcı arayüzü ve AI içerikleri Türkçe; sistem tıbbi teşhis koymaz, yalnızca koçluk rehberliği sunar.
  - **Tracking modülü (C1):** Yeni `tracking` modülü — `WeightLog`, `MealLog`, `WaterLog` Prisma modelleri + repository + service + controller + routes. Endpoint'ler: `POST /GET /api/tracking/weight`, `/meals`, `/water` (tümü `?since=YYYY-MM-DD` parametresi ile). AI coach özelliklerinin birinci sınıf veri kaynağı.
  - **AI Long-Term Memory (1):** `AiMemory` + `AiConversationSummary` Prisma modelleri. `AiMemoryService` (upsertMemory, getRelevantMemory, buildMemoryContext). Kullanıcı trendleri, alışkanlıkları, hatalar ve başarılar saklanır; her AI sohbet isteğine hafıza bağlamı otomatik olarak enjekte edilir. 8 hafıza tipi: WEIGHT_TREND, MEAL_HABITS, BLOOD_TESTS, GOALS, MISTAKES, ACHIEVEMENTS, ACTIVITY, CONVERSATION_SUMMARY.
  - **Proactive AI (2):** `ProactiveMessage` Prisma modeli + `ProactiveAiService` (computeCandidates, generateForUser, listMessages, markRead). Günlük cron (20:00 Turkey) ile eksik öğün, eksik kilo kaydı, hedef gerisinde kalma, düşük su tüketimi, hareketsizlik tespiti. Endpoint'ler: `GET /api/ai-coach/proactive-messages`, `PATCH /api/ai-coach/proactive-messages/:id/read`. 7 mesaj tipi: MISSED_MEAL, MISSED_WEIGHT, GOAL_BEHIND, LOW_WATER, INACTIVITY, RISK_ALERT, WEEKLY_REVIEW, MONTHLY_REVIEW.
  - **Smart Question Engine (3):** `SmartQuestionEngine` (detectProgressDecline, buildQuestionBlock, renderQuestionBlock, recordAnswer). İlerleme düşerse AI, tavsiye vermeden önce kullanıcıya araştırıcı sorular yöneltir (tatil, hastalık, stres, uyku, dışarıda yemek, diğer). Yanıtlar `MISTAKES` hafızasına kaydedilir. Endpoint: `GET /api/ai-coach/progress-check`, `POST /api/ai-coach/smart-answer`.
  - **Dynamic Nutrition Adaptation (4):** `NutritionAdaptationService` (analyzeAndAdapt, getLatestAdaptation). Kilo, kan tahlili, aktivite veya hedef değiştiğinde beslenme planı otomatik olarak adapte edilir; her adaptasyon nedeni hafızaya yazılır. Kilo kaydı ve kan tahlili servislerine hook eklendi. Endpoint'ler: `GET /api/ai-coach/nutrition-adaptation`, `POST /api/ai-coach/nutrition-adaptation/run` (premium).
  - **Risk Detection (5):** `RiskDetectionService` (detectRisks, persistAndEscalate). 8 risk kontrolü: düşük protein, yüksek sodyum, yüksek şeker, hızlı kilo alımı, hızlı kilo kaybı, eksik kan tahlili, hareketsiz yaşam, zayıf öğün tutarlılığı. Yüksek önem dereceli riskler için proaktif mesaj + bildirim oluşturur. Asla tıbbi teşhis koymaz; yalnızca koçluk önerileri döner. Endpoint: `GET /api/ai-coach/risks`.
  - **Weekly Review (6):** `WeeklyReview` Prisma modeli + `WeeklyReviewService` (generateWeeklyReview, getWeeklyReview, getLatestWeeklyReview, toSimplified). Haftalık koçluk raporu: genel skor (0-100), kilo trendi, öğün/su/protein tutarlılığı, koç yorumları, öneriler, sonraki hafta öncelikleri (tümü Türkçe). Pazar 21:00 cron job. Endpoint'ler: `GET /api/ai-coach/weekly-review?week=N&year=YYYY`, `POST /api/ai-coach/weekly-review/generate`. Free kullanıcılar basitleştirilmiş sürüm görür.
  - **Monthly Review (7):** `MonthlyReview` Prisma modeli + `MonthlyReviewService` (generateMonthlyReview, getMonthlyReview, getLatestMonthlyReview). Aylık koçluk özeti: ilerleme, alışkanlık analizi, iyileştirmeler, risk alanları, AI değerlendirmesi, motivasyon mesajı, güncellenmiş öncelikler (Türkçe). Aylık 1. gün 08:00 cron job. **Premium-only** (free kullanıcılar 402 görür). Endpoint'ler: `GET /api/ai-coach/monthly-review?month=M&year=YYYY`, `POST /api/ai-coach/monthly-review/generate`.
  - **Premium AI Experience (8):** `requirePremium` middleware; 402 PREMIUM_REQUIRED hata kodu. Free kullanıcılar: 14 gün hafıza, basit riskler, basitleştirilmiş haftalık özet, aylık rapor yok, 500 token AI yanıtı. Premium kullanıcılar: 90 gün hafıza, detaylı riskler, tam haftalık/aylık raporlar, 1200 token AI yanıtı. AI chat servisi premium duruma göre yanıt uzunluğunu ayarlar.
  - **Notification Preparation (9):** `Notification` Prisma modeli + `NotificationService` (scheduleNotification, getScheduledNotifications, markDelivered, dispatchDue). `NotificationProvider` interface + `LoggingNotificationProvider` stub (Firebase/APNs entegrasyonu sonraki sprint). 6 bildirim tipi: PROACTIVE_MESSAGE, WEEKLY_REVIEW, MONTHLY_REVIEW, RISK_ALERT, GOAL_REMINDER, WATER_REMINDER. Endpoint: `GET /api/notifications/scheduled`.
  - **Scheduler:** `coach-scheduler.ts` (custom `setInterval` tabanlı, Turkey UTC+3, re-entrancy guard, `runOncePerDay` helper). `coach-jobs.ts` (runDailyProactive, runWeeklyReviews, runMonthlyReviews, dispatchNotifications, forEachUser). Bootstrap'ta (`src/index.ts`) `startCoachScheduler()` + `stopCoachScheduler()` shutdown handler.
  - **Database migration:** `20260722000000_sprint19_ai_health_coach_intelligence` — 5 yeni enum (MealType, AiMemoryType, ProactiveMessageType, WeightTrend, NotificationType), 9 yeni tablo (weight_logs, meal_logs, water_logs, ai_memories, ai_conversation_summaries, proactive_messages, weekly_reviews, monthly_reviews, notifications), 9 FK, 13 index.
  - **AI Chat Integration:** `ai-chat.service.ts` güncellemesi — `aiMemoryService.buildMemoryContext()` + `isUserPremium()` + `smartQuestionEngine.renderQuestionBlock()` entegrasyonu. AI her sohbette hafıza-aware ve tier-aware hale geldi.
  - **Existing Service Hooks:** `nutrition-adaptation.service.ts` → `tracking.service.ts` (weight log sonrası) + `blood-test-analysis.service.ts` (analiz tamamlandıktan sonra) hook'landı.
- **Sprint 16 — Herkese Açık Web Sitesi, Üretim Hazırlığı ve iyzico İnceleme Hazırlığı (frontend + production):** iyzico satıcı incelemesi için Diewish'in hizmetlerini, fiyatlandırmasını, ürün bilgilerini ve satın alma akışını herkese açık şekilde sunan, tam teşekküllü profesyonel bir SaaS web sitesi. Mevcut panel/uygulama tasarımı ve işlevi korundu; yeni AI özelliği eklenmedi.
  - **Herkese açık pazarlama sitesi:** Yeni `(marketing)` route grubu ve ortak düzen (duyarlı `SiteHeader` + `SiteFooter`). Sayfalar: **Landing (`/`)** (hero, dört çekirdek AI özelliği, kişiselleştirilmiş planlar tanıtımı, kan tahlili analizi, diyetisyen asistanı, "nasıl çalışır", avantajlar, örnek kullanıcı yorumları, S.S.S. önizleme, çoklu CTA), **Fiyatlandırma (`/pricing`)**, **Özellikler (`/features`)**, **S.S.S. (`/faq`)**, **Hakkımızda (`/about`)**, **İletişim (`/contact`)** ve yasal sayfalar **Gizlilik (`/privacy`)**, **Kullanım Koşulları (`/terms`)**, **Çerez Politikası (`/cookies`)**, **KVKK/GDPR (`/kvkk`)**.
  - **Fiyatlandırma ve ödeme:** Free / Premium / Premium Plus planları için aylık–yıllık faturalandırma geçişli fiyat kartları; "Satın Al" butonları **mevcut Sprint 15 iyzico backend'i** (`POST /payments/checkout`) ile entegre — misafir kullanıcılar plan bilgisini taşıyarak kayda, oturum açmış kullanıcılar barındırılan ödeme sayfasına yönlendirilir. Ödeme sistemi yeniden yazılmadı; yalnızca tüketildi.
  - **Yönlendirme ve gezinme:** Panel `/` konumundan **`/dashboard`** konumuna taşındı; landing page artık `/` üzerinde. `RouteGuard` SSR-güvenli hale getirildi — pazarlama rotaları sunucuda gerçek HTML olarak (spinner olmadan) render edilir (SEO ve iyzico incelemesi için kritik), diğer rotalarda auth/onboarding koruması korunur. Giriş/onboarding sonrası yönlendirmeler, alt gezinme "Ana Sayfa" bağlantısı ve kayıt formundaki koşullar/gizlilik bağlantıları güncellendi.
  - **SEO:** `metadataBase`, Open Graph ve Twitter kartları, sayfa başına başlık/açıklama ve canonical URL'ler; dinamik `robots.txt` (uygulama alanları noindex) ve `sitemap.xml`; `site.webmanifest`.
  - **Üretim yapılandırması:** `next.config.ts` güvenlik başlıkları (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), `output: "standalone"`, sıkıştırma ve `poweredByHeader: false`. Backend `GET /api/health/version` endpoint'i eklendi. Çok aşamalı **Dockerfile** (backend + frontend), `.dockerignore` dosyaları, kök **`docker-compose.yml`** (Postgres + backend + frontend) ve `backend/.env.production.example` + `frontend/.env.production.example`. Ayrıca `backend` için `prisma:migrate:deploy` ve `start:migrate` script'leri.
  - **Dokümantasyon:** Üretim dağıtımı ve iyzico inceleme hazırlığı için `DEPLOYMENT.md`.
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
