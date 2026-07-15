# PROJECT_MEMORY

## Çalışma Kuralları
- İletişim dili Türkçe; teknik isimler İngilizce.
- Üretim kalitesi, doğruluk, güvenlik ve sürdürülebilirlik önceliklidir.
- Doküman birincil doğruluk kaynağıdır.
- Varsayım yapılmayacak; belirsizlik varsa kullanıcıya sorulacak.
- Her faz sonunda onay alınacak.
- Kredi verimliliği gözetilecek.

## Faz 1 Özeti
- Dokümanda regülasyon, AI güvenliği, performans hedefleri ve bazı sınırlar netleştirilmeli.

## Faz 2 Güncel Kararları
- Başlangıç mimarisi: Modular Monolith.
- Domain sınırları mikroservise evrilebilecek şekilde tasarlanacak.
- Business domain modüllerine ek olarak production-grade platform modülleri açıkça tanımlanacak.
- AI kullanıcı deneyimi ile AI yürütme/orchestration katmanı ayrı tasarlanacak.
- Aşağıdaki teknik modüller Faz 2 kapsamına dahil edildi:
  - AI Orchestrator
  - Workflow Engine
  - Background Jobs
  - Cache
  - Feature Flags & Runtime Configuration
  - Consent Management
  - Prompt Registry
- Search, top-level modül değil; ilgili domain'lerde capability olarak ele alınacak.
- API Gateway gerekli bir edge bileşeni olarak kabul edildi ancak Faz 2'de domain modülü olarak sınıflandırılmadı.
- Experiment Management v2+ yol haritasına alındı.

## Faz 2 Ek Bağımsız Mimari Değerlendirme Kararları
- Faz 2 mevcut haliyle tamamen yetersiz değil; küçük revizyonlarla güçlendirilmeli.
- Tenant & Organization Management mantıksal modülü eklendi.
  - MVP'de minimal tenant context desteklenecek.
  - Hibrit multi-tenant stratejisi tam kapsamlı olarak daha sonra açılacak.
- Policy Engine ayrı top-level modül olarak değil, platform capability / mimari karar olarak ele alınacak.
- Secrets Management ayrı domain modülü değildir; cloud/security platform bileşeni olarak zorunlu kabul edildi.
- Event Bus ayrı top-level modül olarak MVP'de zorunlu değil.
  - Ancak Domain Events yaklaşımı mimari karar olarak kabul edildi.
  - Başlangıç yaklaşımı: in-process domain events + outbox uyumlu tasarım.
- Scheduler, Background Jobs & Scheduler modülünün parçası olarak kabul edildi; ayrı top-level modül açılmadı.
- Rate Limiting, platform capability olarak zorunlu kabul edildi.
- API Versioning Strategy, Faz 2'de mimari karar olarak kaydedildi; detay tasarım Faz 8'de yapılacak.

## Faz 3 & 3.1 Özeti - Sistem Mimarisi
- Modular Monolith ve DDD tabanlı sistem tasarımı donduruldu.
- Production Baseline revizyonu (Faz 3.1) ile güvenlik, dayanıklılık (resilience) ve operasyonel standartlar eklendi.
- AI güvenliği için PHI Minimization zorunlu kılındı (AD-039).
- Modül sınırlarının teknik olarak korunması (Boundary Enforcement) kararlaştırıldı.
- Thin Slice Architecture prensibi ile MVP kapsamındaki over-engineering riski minimize edildi.



---

## 📌 GÜNCEL PROJE DURUMU (Snapshot · 2026-07-15)

> Bu bölüm, gelecekteki bir oturumun projeyi sıfırdan anlayabilmesi için tam durum özetidir.
> **Ürün adı: Diewish** (resmi). Eski geçici ad "AI Dietitian Platform" kullanımdan kaldırıldı.

### Genel
- **Aktif Sprint:** Sprint 11 (Kan Tahlili Yükleme Altyapısı — backend) **tamamlandı** → Sprint 12 (kan tahlili AI analizi — yüklenen dosyaları tüketir) sıradaki.
- **Son Commit Hash:** bkz. `git log` — `feat(blood-test): Sprint 11 blood test upload infrastructure`
- **Aktif Branch:** `main`
- **Sürüm:** Frontend `0.1.0` · Backend `0.3.0` (auth + onboarding + account lifecycle + blood-test upload modülleri)
- **Genel Tamamlanma:** ~%58
- **V1 Stratejisi:** Launch Blocker / Post-Launch / Future Vision önceliklendirmesi `ROADMAP.md`'de (V1 = mümkün olan en kısa sürede kararlı, güvenli, production-ready yayın).

### Modüller
- **Tamamlanan Modüller:** Frontend Foundation, Auth UI, Dashboard, Meals (UI), AI Chat (UI/mock), Goals (tam), Backend Foundation, **Backend Auth (Sprint 8: register/login/refresh-token/logout/me + rotation/reuse-detection + auth rate-limit)**, **Onboarding (Sprint 9: UserProfile + zorunlu çok adımlı onboarding, frontend auth entegrasyonu + session store + route guard)**, **Account Lifecycle (Sprint 10 — backend: e-posta doğrulama, şifre sıfırlama/değiştirme, hesap silme talebi + kalıcı silme, tek kullanımlık/süreli token'lar, denetim günlüğü)**, **Blood Test Upload (Sprint 11 — backend: sağlayıcı-bağımsız depolama soyutlaması + yerel depolama, PDF/JPEG/PNG/WebP magic-byte doğrulama, boyut/tek-dosya limiti, yükle/listele/indir/değiştir/sil + metadata + sahiplik-kapsamı + denetim günlüğü)**.
- **Kalan Modüller:** Account Lifecycle frontend UI (Sprint 10 backend hazır, ekranlar sonraki), Blood Test frontend UI (Sprint 11 backend hazır, ekranlar sonraki), kan tahlili AI analizi (Sprint 12 — yüklenen dosyaları tüketir), domain backend API'leri (Meals/Goals/Dashboard/Chat kalıcılığı), gerçek AI Orchestrator, 30/60 gün plan, abonelik + iyzico, yasal/uyum katmanı, CI/CD, Monitoring, Deployment.

### Bileşen Durumları
- **Frontend Status:** ✅ Kod tamam (port 3000). Sprint 9 doğrulaması: **lint ✓ (0 uyarı), type-check ✓ (0 hata)**. Auth session store + route guard + onboarding sihirbazı eklendi. ⚠️ Bu sprint kredi optimizasyonuyla `build` ve `preview` **alınmadı**.
- **Backend Status:** ✅ Kod tamam (port 4000). Sprint 11 doğrulaması: **lint ✓ (0 uyarı), type-check ✓ (0 hata)**. Blood-test upload modülü + `storage` (sağlayıcı-bağımsız) soyutlaması eklendi; `multer` bağımlılığı eklendi. ⚠️ Bu sprint kredi optimizasyonuyla `build` ve `preview` **alınmadı**.
- **Database Status:** ✅ PostgreSQL 17 · `ai_dietitian` DB · `dietitian` kullanıcısı (CREATEDB verildi). Migration'lar: `20260711213135_init`, `20260715202355_add_auth_user_refresh_token`, `20260715203846_add_user_profile_onboarding`, `20260715205703_add_account_lifecycle`, `20260715210742_add_blood_test_uploads` (blood_test_uploads + BloodTestStatus enum + AuditAction'a 3 değer). ⚠️ VM restart sonrası Postgres kalıcı değil (yeniden kurulum + migrate gerekir).
- **API Status:** ✅ `/api/health`, `/api/health/ready` · **Auth: `POST /api/auth/{register,login,refresh-token,logout}` + `GET /api/auth/me`** · **Account: `POST /api/account/email/verify/{request,confirm}` + `/password/{forgot,reset,change}` + `/deletion/{request,cancel}` + `DELETE /api/account`** · **Onboarding: `POST /api/onboarding` + `GET /api/onboarding`** · **BloodTests: `POST /api/blood-tests` + `GET /api/blood-tests` + `GET /api/blood-tests/:id` + `GET /api/blood-tests/:id/file` + `PUT /api/blood-tests/:id/file` + `DELETE /api/blood-tests/:id`** · Swagger `/docs` (Auth + Account + Onboarding + BloodTests tag + bearerAuth). Diğer domain endpoint'leri henüz yok.
- **AI Status:** ⚠️ Yalnızca frontend sohbet arayüzü (mock). Gerçek AI orchestrator/model entegrasyonu yok.
- **Deployment Status:** ⚠️ Sadece dev/preview. Preview URL: https://685bf5caa.na115.preview.abacusai.app (HTTP 200). CI/CD ve production deployment yok.

### Mimari Özet
- **Modular Monolith + DDD.** Her modül Application / Domain / Infrastructure katmanlarına sahip (AD-023).
- Modüller arası iletişim yalnızca public application contracts + domain events (AD-024).
- Domain katmanı framework/infra bağımlılığı taşımaz (AD-025).
- Standart JSON envelope, correlation ID ile uçtan uca izlenebilirlik (AD-043).
- Thin Slice Architecture (AD-045) ile MVP'de over-engineering'den kaçınılıyor.

### Klasör Yapısı Özeti
```
ai-dietitian-platform/
├── backend/          # Express + TS + Prisma (src: config, lib, middleware, routes, utils, types, docs)
│   └── prisma/       # schema.prisma (HealthCheck) + migrations
├── frontend/         # Next.js 15 App Router (src: app, presentation, application, domain, infrastructure, shared)
├── docs/             # Uygulama Projesi.pdf (FROZEN spesifikasyon)
├── ARCHITECTURE_DECISIONS.md  (AD-001 … AD-045)
├── PROJECT_MEMORY.md · TODO_MASTER.md · ROADMAP.md · CHANGELOG.md · README.md
```

### Aktif Teknolojiler
- **Frontend:** Next.js 15.5, React, TypeScript, Tailwind CSS v3, shadcn/ui + Radix, lucide-react, react-hook-form, Zod, next-themes.
- **Backend:** Node 22, Express 4.21, TypeScript, Prisma 6.2 + PostgreSQL 17, Pino/pino-http, Helmet, express-rate-limit, compression, Zod, swagger-jsdoc/swagger-ui-express, **bcryptjs**, **jsonwebtoken**, **multer**, tsx.
- **Tooling:** ESLint, Prettier, npm.

### Bilinen Sorunlar (Known Issues)
1. **GitHub push 403 (Critical):** GitHub App'te bu repo için write izni yok → yerel commit'ler push edilemiyor.
2. **Postgres kalıcı değil (High):** VM restart sonrası DB sunucusu resetleniyor.
3. **`/profile` route yok (Medium):** Navbar linki soft 404 veriyor (bkz. TD-01).
4. **Backend entegrasyonu eksik (Medium):** Frontend Meals/Goals/Chat verileri istemci tarafında.

### Bu Sprint'te Alınan Kararlar
- Kalite kapıları (lint + type-check + build) hem frontend hem backend için zorunlu geçiş kriteri.
- Build artefaktları (`dist/`, `.next/`, `*.tsbuildinfo`, `node_modules/`) git'e dahil edilmez — doğrulandı, temiz.
- `.env` git'e alınmaz; yalnızca `.env.example` sürümlenir.
- Proje dokümanları (TODO_MASTER, PROJECT_MEMORY, ROADMAP, CHANGELOG) her sprint sonunda senkron tutulur.
- SemVer izlenecek; mevcut sürüm `0.1.0`.

### Önerilen Sonraki Sprint
**Sprint 8 — Backend Authentication Infrastructure (Critical):**
`User` + `RefreshToken` Prisma modelleri → migration → bcrypt hashing → JWT (access+refresh) → auth service/controller (register/login/logout/current-user/refresh) → auth middleware → frontend auth akışının backend'e bağlanması → entegrasyon testleri.
