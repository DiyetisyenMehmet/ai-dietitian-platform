# AI Dietitian Platform

Kurumsal, AI destekli diyetisyen platformu. Modular Monolith + Domain-Driven Design.

## Depo Yapısı

```
.
├── docs/                     # Mimari & planlama dokümantasyonu (FROZEN)
├── frontend/                 # Next.js 15 web uygulaması (App Router, TypeScript)
├── PROJECT_MEMORY.md         # Proje hafızası ve faz özetleri
├── ARCHITECTURE_DECISIONS.md # Mimari kararlar (AD-001 ... AD-045)
└── TODO_MASTER.md            # Faz bazlı ana görev listesi
```

## Frontend (Sprint 1 — Foundation)

Teknoloji: **Next.js 15** · TypeScript · App Router · Tailwind CSS v3 · shadcn/ui tabanlı
bileşenler · next-themes · ESLint · Prettier.

Domain odaklı katmanlı klasör mimarisi:

```
frontend/src/
├── app/                      # App Router (route + layout)
├── presentation/            # UI katmanı (components, layout, providers, hooks)
│   ├── components/ui/         #   Reusable UI: Button, Card, Input, Modal, Skeleton...
│   ├── components/layout/     #   AppShell, Header, BottomNavigation, ThemeToggle
│   ├── components/feedback/   #   Loading, ErrorState, EmptyState
│   └── providers/             #   ThemeProvider, AppProviders
├── application/             # Uygulama katmanı (config, services)
├── domain/                  # Domain katmanı (iş kuralları — sonraki sprintler)
├── infrastructure/          # Dış dünya (API http-client)
└── shared/                  # Ortak yardımcılar (lib, constants, types)
```

### Geliştirme

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run type-check
npm run build
```

Backend API adresi `frontend/.env` içinde `NEXT_PUBLIC_API_BASE_URL` ile yapılandırılır
(bkz. `.env.example`).
