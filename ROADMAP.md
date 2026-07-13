# ROADMAP — AI Dietitian Platform

> Uzun vadeli yol haritası. Fazlar bazında organize edilmiştir.
> Son güncelleme: 2026-07-13 · Genel tamamlanma: ~%42

Mimari temel: **Modular Monolith + Domain-Driven Design** (bkz. `ARCHITECTURE_DECISIONS.md`).

---

## Phase 1 — Foundation & Frontend MVP · ✅ Completed

**Progress:** %100 · **Estimated completion:** Tamamlandı (2026-07)

**Features**
- Proje mimarisi ve doküman analizi (Faz 1–3).
- Frontend foundation: Next.js 15, App Router, TypeScript, Tailwind, shadcn/ui.
- Katmanlı domain klasör yapısı, tema (light/dark), navigasyon.
- Modüller (UI seviyesi): Auth ekranları, Dashboard, Meals, AI Chat, Goals.

**Dependencies:** Yok (başlangıç fazı).

---

## Phase 2 — Backend Platform & Authentication · 🚧 In Progress

**Progress:** ~%35 · **Estimated completion:** 2026-08 (tahmini ~2–3 hafta)

**Features**
- ✅ Backend foundation: Express + TS, Pino logging, correlation ID, error handling, Zod env validation.
- ✅ PostgreSQL 17 + Prisma ORM, health endpoint'leri, Swagger `/docs`.
- ✅ Güvenlik temeli: CORS, Helmet, compression, rate-limit.
- ⏭️ **Authentication Infrastructure (Sprint 8):** User/RefreshToken modelleri, bcrypt, JWT, auth service/controller, auth middleware.
- ⏳ Frontend ↔ Backend auth entegrasyonu.
- ⏳ Domain backend API'leri (Meals, Goals, Dashboard) + kalıcı veri modelleri.

**Dependencies:** Phase 1 (frontend akışları), çalışan PostgreSQL.

---

## Phase 3 — AI Orchestration & Domain Persistence · ⏳ Pending

**Progress:** %0 · **Estimated completion:** 2026-09 (tahmini ~3–4 hafta)

**Features**
- Gerçek AI Orchestrator: model routing, prompt registry, fallback, PHI minimization (AD-039).
- AI Chat'in mock'tan gerçek servise geçişi.
- Meals/Goals/Chat verilerinin backend'e taşınması (istemci state → API + DB).
- Profile modülü (`/profile` route + backend).
- Background Jobs & Scheduler temel kurulumu.

**Dependencies:** Phase 2 (auth + backend API + DB modelleri).

---

## Phase 4 — Production Hardening & Deployment · 🔮 Future

**Progress:** %0 · **Estimated completion:** 2026-Q4 (tahmini ~4–6 hafta)

**Features**
- CI/CD pipeline (lint + type-check + build + test + deploy).
- Otomatik test altyapısı (unit / integration / e2e).
- Monitoring & Observability (metrics/APM), alerting.
- Cloud infrastructure + managed PostgreSQL (kalıcı DB).
- Feature flags, rate-limiting üretim ayarları, secrets management.
- RAG / Knowledge Base (opsiyonel, v2+).
- Multi-tenant / Organization Management (v2+).

**Dependencies:** Phase 2 & 3 (stabil backend + AI + domain API'leri).

---

### Faz–Sprint Eşlemesi

| Phase | İlgili Sprintler | Durum |
|---|---|---|
| Phase 1 | Sprint 1–6 | ✅ Completed |
| Phase 2 | Sprint 7 (✅), Sprint 8+ (🚧) | 🚧 In Progress |
| Phase 3 | Sprint 9+ | ⏳ Pending |
| Phase 4 | Sprint (ileri) | 🔮 Future |
