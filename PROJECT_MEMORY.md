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

## 📌 GÜNCEL PROJE DURUMU (Snapshot · 2026-07-22)

> Bu bölüm, gelecekteki bir oturumun projeyi sıfırdan anlayabilmesi için tam durum özetidir.
> **Ürün adı: Diewish** (resmi). Eski geçici ad "AI Dietitian Platform" kullanımdan kaldırıldı.

### Genel
- **Aktif Sprint:** Sprint 19 (AI Health Coach Intelligence) **tamamlandı** → Sprint 20 (Documentation Sync) sıradaki.
- **Son Commit Hash:** `4c5e82b2df824c3c64799360ac176a6bb1d680c6`
- **Aktif Branch:** `feature/sprint-19-ai-health-coach-intelligence` (PR açıldı, merge bekliyor)
- **Base Branch:** `feature/sprint-18-product-polish-account-subscription`
- **Sürüm:** Backend `0.4.0` (AI Health Coach Intelligence eklendi)
- **Genel Tamamlanma:** ~%75
- **V1 Stratejisi:** Launch Blocker / Post-Launch / Future Vision önceliklendirmesi `ROADMAP.md`'de (V1 = mümkün olan en kısa sürede kararlı, güvenli, production-ready yayın).

### Modüller
- **Tamamlanan Modüller (Sprint 1–19):** 
  - Frontend: Foundation, Auth UI, Dashboard, Meals (UI), AI Chat (UI), Goals, Marketing Site, Public Website, SEO
  - Backend: Foundation, Auth (JWT + refresh rotation), Onboarding (UserProfile), Account Lifecycle (email verify, password reset, account deletion), Blood Test Upload, AI Blood Test Analysis, AI Nutrition Plan, AI Dietitian Chat, AI Usage Quota, Subscription Management, Payment Integration (iyzico), Legal/Compliance (KVKK), **Tracking (weight/meal/water logs)**, **AI Health Coach (memory, proactive AI, smart questions, nutrition adaptation, risk detection, weekly/monthly reviews)**, **Notifications (scheduling layer)**
- **Kalan Modüller:** Frontend UI için AI Health Coach özelliklerinin ekranları, gerçek e-posta sağlayıcısı entegrasyonu (mailer), production deployment, CI/CD, APM/monitoring.

### Bileşen Durumları
- **Frontend Status:** ✅ Kod tamam (port 3000). Sprint 16 ile herkese açık pazarlama sitesi, SEO ve production yapılandırması eklendi. Tüm doğrulamalar başarılı.
- **Backend Status:** ✅ Kod tamam (port 4000). Sprint 19 doğrulaması: **lint ✓ (0 uyarı), type-check ✓ (0 hata), prisma validate ✓, prisma generate ✓**. AI Health Coach modülleri (tracking, ai-coach, notifications) + scheduler eklendi.
- **Database Status:** ✅ PostgreSQL 17 · `ai_dietitian` DB · `dietitian` kullanıcısı. Migration'lar: init, auth, onboarding, account lifecycle, blood-test upload, sprint 12-14 catch-up, sprint 15 subscriptions/payments/legal, **sprint 19 AI Health Coach Intelligence** (`20260722000000_sprint19_ai_health_coach_intelligence` — 5 yeni enum, 9 yeni tablo, 9 FK, 13 index).
- **API Status:** ✅ Tüm core API'ler hazır:
  - **Health:** `/api/health`, `/api/health/ready`, `/api/health/version`
  - **Auth:** register, login, refresh-token, logout, me
  - **Account:** email verify, password reset/change, account deletion
  - **Onboarding:** profil kayıt + okuma
  - **Blood Tests:** yükle, listele, indir, değiştir, sil + AI analizi
  - **AI Chat:** mesaj gönder, konuşmaları listele/sil
  - **AI Usage:** kota kontrolü, kullanım geçmişi
  - **Nutrition Plan:** plan oluştur/güncelle/oku
  - **Subscription:** planlar, mevcut abonelik, iptal
  - **Payments:** checkout, doğrulama, geçmiş, webhook
  - **Legal:** dokümanlar, rıza yönetimi
  - **Tracking:** kilo/yemek/su kayıtları (Sprint 19)
  - **AI Coach:** proaktif mesajlar, hafıza, akıllı sorular, beslenme adaptasyonu, risk tespiti, haftalık/aylık değerlendirmeler (Sprint 19)
  - **Notifications:** zamanlanmış bildirimleri listele (Sprint 19)
- **AI Status:** ✅ Gerçek AI entegrasyonu tamamlandı: OpenAI-uyumlu adaptör, kan tahlili analizi, beslenme planı, diyetisyen sohbeti, **AI hafızası**, **proaktif koçluk**, **akıllı soru motoru**, **risk tespiti**, **haftalık/aylık değerlendirmeler**.
- **Scheduler Status:** ✅ Custom setInterval-tabanlı scheduler (Turkey UTC+3); günlük (20:00), haftalık (Pazar 21:00), aylık (1. gün 08:00) ve bildirim dispatch görevleri çalışıyor.
- **Deployment Status:** ✅ Production-ready Docker yapılandırması (multi-stage Dockerfile, docker-compose.yml). `DEPLOYMENT.md` dokümantasyonu mevcut.

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
- **Backend:** Node 22, **Express 4.21** (NOT NestJS), TypeScript, Prisma 6.2 + PostgreSQL 17, Pino/pino-http, Helmet, express-rate-limit, compression, Zod, swagger-jsdoc/swagger-ui-express, bcryptjs, jsonwebtoken, multer, tsx.
- **Tooling:** ESLint, Prettier, npm.

### Mimari & Teknik Kararlar (Sprint 19 sonrası kritik notlar)
- **Backend Framework:** Express + TypeScript (NestJS DEĞİL). Zamanlanmış görevler için harici kütüphane YOK — custom `setInterval` tabanlı scheduler kullanılıyor.
- **Zaman Hesaplamaları:** Tüm scheduler ve metrik hesaplamaları **Turkey yerel saati (UTC+3)** kullanır (`metrics.ts` yardımcıları ile).
- **Premium Gating:** `requirePremium` middleware ile; free kullanıcılar premium endpoint'lere erişince **402 PREMIUM_REQUIRED** döner.
- **Dil:** Tüm kullanıcı arayüzü, AI yanıtları, koçluk mesajları ve raporlar **Türkçe**'dir.
- **Zaman Serisi Verileri:** `WeightLog`, `MealLog`, `WaterLog` modelleri tracking için birinci sınıf veri kaynağıdır (Sprint 19'da eklendi).
- **AI Hafızası:** `AiMemory` modeli; kullanıcı trendleri, alışkanlıkları, hatalar ve başarılar saklanır; her AI sohbetine bağlam olarak enjekte edilir.
- **Proaktif AI:** Günlük cron (20:00 Turkey saati) ile kullanıcılar için eksik kayıt/hedef gerisinde kalma mesajları üretilir (`ProactiveMessage`).
- **Bildirimler:** `NotificationService` + pluggable `NotificationProvider` mimarisi; şu an `LoggingNotificationProvider` stub kullanılıyor (Firebase/APNs sonraki sprint).
- **Veritabanı:** Migration'lar asla geri alınmaz; her değişiklik yeni migration dosyası gerektirir. Yerel development'ta PostgreSQL kalıcı değil (VM restart sonrası yeniden kurulum gerekir).

### Bilinen Sorunlar (Known Issues)
1. **Postgres kalıcı değil (Medium):** VM restart sonrası DB sunucusu resetleniyor; production'da managed DB gerekli.
2. **E-posta sağlayıcısı (Medium):** `mailer` soyutlaması mevcut ama gerçek e-posta servisi (SendGrid/AWS SES) entegre değil; production öncesi gerekli.
3. **Bildirim push (Low):** `NotificationProvider` stub olarak `LoggingNotificationProvider` kullanıyor; Firebase/APNs entegrasyonu post-launch.

### Sprint 19'da Alınan Kararlar
- **Express (NestJS değil):** Mevcut backend Express tabanlı; zamanlanmış görevler için custom scheduler uygulandı (harici kütüphane yok).
- **Turkey Saati (UTC+3):** Tüm scheduler ve metrik hesaplamaları yerel Türkiye saati kullanır.
- **Premium Gating:** 402 PREMIUM_REQUIRED hata kodu ile free/premium ayrımı yapıldı; free kullanıcılara basitleştirilmiş hafıza ve raporlar sunuluyor.
- **Tıbbi Sorumluluk:** AI asla teşhis koymaz; yalnızca koçluk rehberliği yapar (risk tespiti için coaching recommendations).
- **Zaman Serisi Tracking:** `WeightLog`, `MealLog`, `WaterLog` modelleri birinci sınıf veri kaynağı olarak eklendi.

### Önerilen Sonraki Sprint
**Sprint 20 — AI Health Coach Frontend UI:**
Sprint 19 backend özelliklerini tüketen frontend ekranları:
- Proaktif mesaj bildirim merkezi (badge + liste)
- Haftalık değerlendirme kartı (dashboard widget + detay ekranı)
- Aylık değerlendirme detay ekranı (premium)
- Risk uyarıları widget'ı
- Beslenme adaptasyon bildirimi
- Akıllı soru bloğu (AI sohbette görünür)
- Hafıza özeti (settings/profil ekranında)
