# TODO_MASTER

> Son güncelleme: 2026-07-13 · Branch: `main` · Genel tamamlanma: **~%42**
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
- [ ] Frontend auth akışının backend'e bağlanması — **(Critical)** *(Sprint 9'a taşındı)*
- [ ] Auth endpoint entegrasyon testleri — **(High)** *(test altyapısı Sprint 18'de)*

> Not: Bu sprint kullanıcı talimatıyla **build/preview alınmadan** tamamlandı; doğrulama `type-check` (tsc --noEmit) + `lint` (0 hata/0 uyarı) + Prisma migration'ın canlı DB'ye uygulanması ile yapıldı.

---

## Kalan İş Tahminleri (Sprint bazında)

| Sprint / Alan | Öncelik | Tahmini Eforu |
|---|---|---|
| Sprint 8 — Auth Infrastructure (BE) | Critical | ~3–4 gün |
| Frontend ↔ Backend auth entegrasyonu | Critical | ~1–2 gün |
| Meals/Goals/Dashboard için backend API + DB modelleri | High | ~5–7 gün |
| AI Orchestrator (gerçek entegrasyon) | High | ~4–6 gün |
| `/profile` route + profil modülü | Medium | ~2 gün |
| CI/CD + DevOps workflow | Medium | ~2–3 gün |
| Monitoring/metrics (APM) | Medium | ~2 gün |
| Deployment (cloud) | Low | ~3 gün |

**Toplam tahmini kalan efor:** ~22–29 gün · **Genel tamamlanma:** ~%42

---

## Blocker'lar (Aktif)

1. **GitHub push izni (Critical):** Abacus.AI GitHub App'in bu repoda **write (Contents: Read & write)** izni yok. `git push` → `403`. Yerel commit'ler push edilemiyor.
   - Çözüm: https://github.com/apps/abacusai/installations/select_target adresinden `ai-dietitian-platform` reposuna write izni verilmeli.
2. **PostgreSQL kalıcı değil (High):** VM her yeniden başladığında Postgres sunucusu sıfırlanıyor; kurulum + migration manuel tekrar gerekiyor. Kalıcı ortam/managed DB gerekli.

---

## Teknik Borç (Technical Debt)

- **TD-01 (Medium):** `/profile` navigasyonda tanımlı (`navigation.ts`) ama route yok → soft 404. Ya route eklenmeli ya link gizlenmeli.
- **TD-02 (Medium):** Frontend Meals/Goals/Chat verileri istemci tarafında (mock/in-memory); kalıcı backend API'sine taşınmalı.
- **TD-03 (Low):** `next lint` deprecate uyarısı veriyor (Next.js 16'da kalkacak); ESLint CLI'ye geçiş gerekli.
- **TD-04 (Low):** Otomatik test altyapısı (unit/integration/e2e) henüz yok.
- **TD-05 (Low):** Root seviyesinde `.gitignore` yok; sadece frontend/backend altında var (şu an sorun değil, ilerisi için eklenebilir).
