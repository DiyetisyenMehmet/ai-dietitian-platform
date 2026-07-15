# Changelog

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenir.
Format [Keep a Changelog](https://keepachangelog.com/) temel alınır ve proje [Semantic Versioning](https://semver.org/lang/tr/) izler.

---

## [Unreleased]

### Added
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
