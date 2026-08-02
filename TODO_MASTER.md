# TODO_MASTER

> Son güncelleme: 2026-07-22 · Branch: `feature/sprint-19-ai-health-coach-intelligence` · Genel tamamlanma: **~%75**
> Bu dosya iki bölümden oluşur: (A) Mimari Planlama Fazları (Faz 1–20) ve (B) Uygulama Sprintleri.
> Kural: Tamamlanan işler silinmez, bekleyen işler korunur, yeni keşfedilen işler eklenir.

---

## A) Mimari Planlama Fazları

- [x] Faz 1 Doküman Analizi
- [x] Faz 2 Modül Tasarımı (ilk sürüm)
- [x] Faz 2 Revizyonu: büyük ölçekli SaaS teknik modüllerinin yeniden değerlendirilmesi
- [x] Faz 2 Revizyonu: ek platform/mimari bileşenlerin bağımsız değerlendirilmesi
- [ ] Faz 2 onayı — **(Medium)** kullanıcı onayı bekliyor
- [x] Faz 3 Yazılım Mimarisi (Production-Grade Baseline)
- [x] Faz 4 Frontend Mimarisi *(uygulamaya döküldü — Sprint 1)*
- [~] Faz 5 Backend Mimarisi *(temel atıldı — Sprint 7; domain modülleri sürüyor)*
- [~] Faz 6 Veritabanı Şeması *(HealthCheck modeli var; User/RefreshToken vb. bekliyor)*
- [ ] Faz 7 AI Mimarisi — **(High)**
- [~] Faz 8 API Mimarisi *(envelope + health + Swagger hazır; domain endpoint'leri bekliyor)*
- [ ] Faz 9 Authentication & Authorization — **(Critical)** bir sonraki sprint
- [ ] Faz 10 Cloud Infrastructure — **(Low)**
- [ ] Faz 11 DevOps Workflow — **(Medium)** (CI/CD henüz yok)
- [ ] Faz 12 Monitoring & Logging — **(Medium)** (Pino logging var; APM/metrics yok)
- [ ] Faz 13 Security Architecture — **(High)** (Helmet/CORS/rate-limit var; auth/authz eksik)
- [ ] Faz 14 RAG / Knowledge Base Architecture — **(Low)**
- [x] Faz 15 Project Folder Structure
- [x] Faz 16 Development Roadmap *(bkz. ROADMAP.md)*
- [ ] Faz 17 Milestones — **(Low)**
- [x] Faz 18 Implementation Order
- [ ] Faz 19 Complexity Estimation — **(Low)**
- [x] Faz 20 Module Dependencies

Durum simgeleri: `[x]` tamam · `[~]` kısmen · `[ ]` beklemede

---

## B) Uygulama Sprintleri

### Sprint 1 — Frontend Foundation ✅ (Tamamlandı · `b2201eb`)
- [x] Next.js 15 + App Router + TypeScript kurulumu — **(Critical)**
- [x] Tailwind CSS v3 + shadcn/ui tabanlı UI bileşenleri — **(High)**
- [x] Katmanlı domain mimarisi (presentation/application/domain/infrastructure/shared) — **(Critical)**
- [x] ThemeProvider + Light/Dark mode + BottomNavigation — **(High)**

### Sprint 2 — Authentication (Frontend) ✅ (Tamamlandı · `94386f6`)
- [x] Login, Register, Forgot/Reset Password, Verify Email sayfaları — **(High)**
- [x] Auth form validation (Zod) + Türkçe hata mesajları — **(High)**
- [ ] Backend auth entegrasyonu — **(Critical)** *(backend hazır olunca bağlanacak)*

### Sprint 3 — Dashboard ✅ (Tamamlandı · `ed86348`)
- [x] Kalori/makro görselleştiricileri + günlük özet — **(High)**

### Sprint 4 — Meals ✅ (Tamamlandı · `f159d39`)
- [x] Öğün listesi + öğün ekleme akışı — **(High)**

### Sprint 5 — AI Chat (Frontend) ✅ (Tamamlandı · `2472914`)
- [x] Sohbet arayüzü + mesaj akışı — **(Medium)**
- [ ] Gerçek AI orchestrator entegrasyonu — **(High)** *(mock → gerçek servis)*

### Sprint 6 — Goals ✅ (Tamamlandı · `7e5f519`)
- [x] 8 hedef tipi (kilo, kalori, su, adım vb.) — **(High)**
- [x] Zod validation (Türkçe) + `useSyncExternalStore` state yönetimi — **(High)**
- [x] Dashboard, detay (dairesel ilerleme + haftalık grafik), form (unsaved-changes guard) — **(High)**

### Sprint 7 — Backend Foundation ✅ (Tamamlandı · `15e4bc1`)
- [x] Express + TypeScript + ESLint/Prettier — **(Critical)**
- [x] Pino logging + correlation ID + request logger — **(High)**
- [x] Zod env validation — **(High)**
- [x] PostgreSQL 17 + Prisma ORM + HealthCheck modeli + ilk migration — **(Critical)**
- [x] Error handling (ApiError) + standart JSON envelope + validate middleware — **(High)**
- [x] Güvenlik: CORS, Helmet, compression, rate-limit — **(High)**
- [x] Health endpoint'leri (`/api/health`, `/api/health/ready`) + Swagger `/docs` — **(High)**

### Sprint 8 — Authentication Infrastructure (Backend) ✅ (Tamamlandı)
- [x] `User` + `RefreshToken` Prisma modelleri + migration (`20260715202355_add_auth_user_refresh_token`) — **(Critical)**
- [x] bcrypt password hashing (`bcryptjs`, configurable cost) — **(Critical)**
- [x] JWT (access + refresh) konfigürasyonu — ayrı secret'lar, TTL, issuer — **(Critical)**
- [x] Auth service/controller: register, login, refresh-token, logout, current-user (`/me`) — **(Critical)**
- [x] Auth middleware (`authenticate` + `authorize` rol guard) — **(High)**
- [x] Refresh token rotation + reuse detection — **(High)**
- [x] Auth'a özel rate limiting (brute-force koruması) — **(High)**
- [x] Frontend auth akışının backend'e bağlanması — **(Critical)** *(Sprint 9'da tamamlandı)*
- [ ] Auth endpoint entegrasyon testleri — **(High)** *(test altyapısı Sprint 18'de)*

> Not: Bu sprint kullanıcı talimatıyla **build/preview alınmadan** tamamlandı; doğrulama `type-check` (tsc --noEmit) + `lint` (0 hata/0 uyarı) + Prisma migration'ın canlı DB'ye uygulanması ile yapıldı.

### Sprint 9 — Zorunlu Kullanıcı Onboarding'i ✅ (Tamamlandı)
- [x] Prisma `UserProfile` modeli + `Gender`/`ActivityLevel`/`DietaryPreference` enum'ları + migration (`20260715203846_add_user_profile_onboarding`) — **(Critical)**
- [x] Onboarding modülü (DDD): `onboarding.schemas` (Zod), `repository` (transaction'lı upsert + `onboardingCompleted` flag), `service` (yaş türetme), `controller`, `routes` — **(Critical)**
- [x] Endpoint'ler: `POST /api/onboarding` (profil kaydı + uygulama kilidini açar), `GET /api/onboarding` — **(Critical)**
- [x] Frontend auth entegrasyonu: session store (localStorage), HTTP client bearer-token + envelope unwrap, `authClient` (login/register/refresh/logout/me) — **(Critical)**
- [x] Çok adımlı, mobile-first onboarding sihirbazı (5 adım; ad, doğum tarihi/yaş, cinsiyet, boy, mevcut/hedef kilo, aktivite, sağlık durumu, alerji, beslenme tercihi, günlük su hedefi) — **(Critical)**
- [x] Route guard: onboarding tamamlanana kadar tüm uygulama özellikleri kilitli — **(Critical)**

> Not: Sprint 9 da kredi optimizasyonu gereği **build/preview alınmadan** tamamlandı; doğrulama backend + frontend `type-check` + `lint` (0 hata/0 uyarı) + Prisma migration'ın canlı DB'ye uygulanması ile yapıldı.

### Sprint 10 — Hesap Yaşam Döngüsü (Backend) ✅ (Tamamlandı)
- [x] Prisma `AccountToken` + `AuditLog` modelleri, `AccountTokenType`/`AuditAction` enum'ları, `User.deletionRequestedAt` + migration (`20260715205703_add_account_lifecycle`) — **(Critical)**
- [x] Account modülü (DDD): `account.schemas` (Zod), `repository` (yarış-güvenli tek kullanım + atomik transaction'lar), `service`, `controller`, `routes` — **(Critical)**
- [x] E-posta doğrulama: `POST /api/account/email/verify/request` + `/confirm` — **(Critical)**
- [x] Şifre sıfırlama/değiştirme: `/password/forgot` + `/reset` + `/change` (sıfırlama/değiştirmede tüm oturumlar iptal) — **(Critical)**
- [x] Hesap silme talebi + iptal + kalıcı silme: `/deletion/request` + `/deletion/cancel` + `DELETE /api/account` (şifre ile yeniden kimlik doğrulama) — **(Critical)**
- [x] Güvenli token'lar (256-bit opak, yalnızca SHA-256 hash saklanır), süre dolumu, tek kullanım, enumerasyon önleme, güvenlik olayları için denetim günlüğü — **(Critical)**
- [x] Sağlayıcı-bağımsız `mailer` soyutlaması (dev log transport) + `audit` lib + `Account` Swagger tag'i — **(High)**

> Not: Sprint 10 backend-odaklıdır (kapsam frontend içermiyor); kredi optimizasyonu gereği **build/preview alınmadan** tamamlandı. Doğrulama: backend `type-check` + `lint` (0 hata/0 uyarı) + Prisma migration'ın canlı DB'ye uygulanması.

### Sprint 11 — Kan Tahlili Yükleme Altyapısı (Backend) ✅ (Tamamlandı)
- [x] Prisma `BloodTestUpload` modeli + `BloodTestStatus` enum (`UPLOADED`; `ANALYZING`/`ANALYZED`/`FAILED` AI için ileriye dönük) + `AuditAction`'a 3 değer + migration (`20260715210742_add_blood_test_uploads`) — **(Critical)**
- [x] Sağlayıcı-bağımsız depolama soyutlaması (`StorageProvider` arayüzü + `LocalStorageProvider`, path-traversal korumalı; `STORAGE_PROVIDER`/`STORAGE_LOCAL_ROOT`/`BLOOD_TEST_MAX_FILE_SIZE_MB` env) — **(Critical)**
- [x] BloodTest modülü (DDD): `schemas` (Zod), `repository` (sahiplik-kapsamlı), `service` (magic-byte MIME doğrulama + sha256 checksum + rollback'li yükleme), `controller`, `routes` — **(Critical)**
- [x] `multer` memory storage + boyut/tek-dosya limiti + `fileFilter`; gerçek tip doğrulama magic-byte ile (PDF/JPEG/PNG/WebP) — **(Critical)**
- [x] Endpoint'ler: `POST /api/blood-tests` (yükle), `GET /api/blood-tests` (geçmiş), `GET /:id` (metadata), `GET /:id/file` (indir), `PUT /:id/file` (değiştir), `DELETE /:id` (sil) — **(Critical)**
- [x] Sahiplik-kapsamı (yetkisiz erişimde varlık sızdırmayan 404), rastgele UUID storage key, tüm yaşam döngüsü için denetim günlüğü, `BloodTests` Swagger tag'i — **(High)**

### Sprint 12–18 ✅ (Tamamlandı)
- [x] AI Blood Test Analysis (Sprint 12) — OCR + AI analizi
- [x] AI Nutrition Plan (Sprint 13) — kişiselleştirilmiş beslenme planı
- [x] AI Dietitian Chat + Usage Quota (Sprint 14) — sohbet + kota sistemi
- [x] Subscriptions + Payments (Sprint 15) — iyzico + abonelik + fatura
- [x] Marketing Site + Production Config (Sprint 16) — herkese açık web + SEO + Docker
- [x] Legal + Compliance (Sprint 17) — KVKK + gizlilik + rıza yönetimi
- [x] Product Polish (Sprint 18) — UX iyileştirmeleri + hesap yönetimi

### Sprint 19 — AI Health Coach Intelligence ✅ (Tamamlandı)
- [x] Tracking modülü: `WeightLog`, `MealLog`, `WaterLog` Prisma modelleri + repository + service + controller + routes — **(Critical)**
- [x] AI Long-Term Memory: `AiMemory` + `AiConversationSummary` modelleri, `AiMemoryService` (upsert, getRelevant, buildMemoryContext), hafıza enjeksiyonu tüm AI chat'e — **(High)**
- [x] Proactive AI: `ProactiveMessage` modeli, `ProactiveAiService` (computeCandidates, generateForUser), günlük cron (20:00 Turkey), GET/PATCH endpoints — **(High)**
- [x] Smart Question Engine: `SmartQuestionEngine` (detectProgressDecline, buildQuestionBlock, recordAnswer), GET /api/ai-coach/progress-check — **(High)**
- [x] Dynamic Nutrition Adaptation: `NutritionAdaptationService` (analyzeAndAdapt), kilo/kan tahlili hook'ları, GET /api/ai-coach/nutrition-adaptation — **(High)**
- [x] Risk Detection: `RiskDetectionService` (detectRisks 8 kontrol, persistAndEscalate), GET /api/ai-coach/risks — **(High)**
- [x] Weekly Review: `WeeklyReview` modeli, `WeeklyReviewService` (generateWeeklyReview), Pazar 21:00 cron, GET + POST endpoints — **(High)**
- [x] Monthly Review: `MonthlyReview` modeli, `MonthlyReviewService` (generateMonthlyReview), aylık 1. gün 08:00 cron, GET + POST endpoints, premium-only — **(High)**
- [x] Premium AI Experience: `requirePremium` middleware, free vs premium hafıza derinliği/yanıt uzunluğu/rapor detayı ayrımı, 402 PREMIUM_REQUIRED — **(High)**
- [x] Notification Preparation: `Notification` modeli, `NotificationService` (schedule, getScheduled, markDelivered, dispatchDue), `NotificationProvider` interface + `LoggingNotificationProvider` stub, GET /api/notifications/scheduled — **(Medium)**
- [x] Scheduler: `coach-scheduler.ts` (custom setInterval, Turkey UTC+3, runOncePerDay, tüm cron job'lar), `coach-jobs.ts` (batch işlemler) — **(Critical)**
- [x] Prisma migration: `20260722000000_sprint19_ai_health_coach_intelligence` (5 enum, 9 tablo, 9 FK, 13 index) — **(Critical)**
- [x] Doğrulama: tsc --noEmit ✓, eslint ✓, prisma validate ✓, prisma generate ✓ — **(Critical)**

> Not: Sprint 19, NestJS yerine Express tabanlı mevcut mimariye uygun olarak tamamlandı; zamanlanmış görevler için harici kütüphane kullanılmadı, custom scheduler uygulandı. Tüm kullanıcı metinleri Türkçe; AI asla tıbbi teşhis koymaz.

---

## Kalan İş Tahminleri (Sprint bazında)

| Sprint / Alan | Öncelik | Tahmini Efor |
|---|---|---|
| Sprint 20 — AI Health Coach Frontend UI | High | ~3–4 gün |
| Sprint 21 — Observability & Monitoring (Sentry, uptime, alerting) | High | ~2–3 gün |
| Sprint 22 — Production Deployment + CI/CD (managed DB, secrets, pipeline) | Critical | ~3–4 gün |
| Sprint 23 — E-posta Sağlayıcısı Entegrasyonu (SendGrid/AWS SES) | Medium | ~1–2 gün |
| Sprint 24 — Test Suite + QA (kritik akış testleri) | High | ~3–4 gün |
| Sprint 25 — Store Hazırlık + Launch (metadata, assets, soft launch) | Critical | ~2–3 gün |

**Toplam tahmini kalan efor:** ~14–20 gün · **Genel tamamlanma:** ~%75

---

## Blocker'lar (Aktif)

1. **PostgreSQL kalıcı değil (Medium):** VM her yeniden başladığında Postgres sunucusu sıfırlanıyor; production'da managed DB gerekli (Sprint 22).
2. **E-posta sağlayıcısı yok (Medium):** `mailer` soyutlaması mevcut ama gerçek e-posta servisi entegre değil; production öncesi gerekli (Sprint 23).

---

## Teknik Borç (Technical Debt)

- **TD-01 (Low):** `NotificationProvider` stub olarak `LoggingNotificationProvider` kullanıyor; Firebase/APNs entegrasyonu post-launch.
- **TD-02 (Low):** Otomatik test altyapısı (unit/integration/e2e) henüz yok; Sprint 24'te eklenecek.
- **TD-03 (Low):** Frontend AI Health Coach ekranları henüz yok (proaktif mesajlar, haftalık/aylık değerlendirmeler vb.); Sprint 20'de eklenecek.
