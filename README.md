# Diewish

Kurumsal, AI destekli diyetisyen platformu. Modular Monolith + Domain-Driven Design.

**Sürüm:** 0.1.0 · **Durum:** Frontend MVP + Backend Foundation (~%42) · Detay için bkz. `PROJECT_MEMORY.md`, `ROADMAP.md`, `CHANGELOG.md`.

## Depo Yapısı

```
.
├── docs/                     # Mimari & planlama dokümantasyonu (FROZEN) + Uygulama Projesi.pdf
├── frontend/                 # Next.js 15 web uygulaması (App Router, TypeScript)
├── backend/                  # Express + TypeScript API (Prisma + PostgreSQL)
├── PROJECT_MEMORY.md         # Proje hafızası, faz özetleri ve güncel durum snapshot'ı
├── ARCHITECTURE_DECISIONS.md # Mimari kararlar (AD-001 ... AD-045)
├── TODO_MASTER.md            # Sprint bazlı ana görev listesi (öncelikler + tahminler)
├── ROADMAP.md                # Uzun vadeli yol haritası (fazlar)
└── CHANGELOG.md              # Sürüm bazlı değişiklik günlüğü (SemVer)
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

## Backend (Sprint 7 — Foundation)

Teknoloji: **Node 22** · **Express 4.21** · TypeScript · **Prisma 6.2 + PostgreSQL 17** ·
Pino/pino-http · Helmet · express-rate-limit · compression · Zod · Swagger (swagger-jsdoc /
swagger-ui-express) · tsx · ESLint · Prettier.

Klasör yapısı:

```
backend/src/
├── config/        # env.ts (Zod ile doğrulanmış ortam değişkenleri)
├── lib/           # logger.ts (Pino), prisma.ts (Prisma client + connection check)
├── middleware/    # correlation-id, request-logger, error-handler, not-found, rate-limit, validate
├── routes/        # index.ts, health.route.ts
├── utils/         # api-error, api-response (standart JSON envelope), async-handler
├── docs/          # swagger.ts
├── types/         # express.d.ts
├── app.ts         # Express app kurulumu
└── index.ts       # Sunucu bootstrap
```

### Ortam Değişkenleri (Environment)

`backend/.env` (örnek için `backend/.env.example`):

```
DATABASE_URL="postgresql://dietitian:dietitian_dev_pw@127.0.0.1:5432/ai_dietitian?schema=public"
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

### Geliştirme

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy   # veya geliştirme için: npm run prisma:migrate
npm run dev                 # http://localhost:4000  (tsx watch)
npm run lint
npm run type-check
npm run build               # tsc -> dist/
npm start                   # node dist/index.js
```

### Veritabanı Kurulumu (yerel)

```bash
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER dietitian WITH PASSWORD 'dietitian_dev_pw';"
sudo -u postgres createdb -O dietitian ai_dietitian
```

> Not: Bu geliştirme ortamında PostgreSQL kalıcı değildir; VM yeniden başladıktan sonra kurulum
> ve migration adımlarının tekrarlanması gerekebilir.

## Kalite Kapıları (Quality Gates)

Her sprint sonunda hem frontend hem backend için zorunlu:

| Kontrol | Frontend | Backend |
|---|---|---|
| Lint | `npm run lint` | `npm run lint` |
| Type-check | `npm run type-check` | `npm run type-check` |
| Build | `npm run build` | `npm run build` |
| Prisma | — | `npx prisma generate` + `migrate` |

Tümü sıfır hata/uyarı ile geçmelidir.

## API Dokümantasyonu

- Swagger UI: `http://localhost:4000/docs`
- Health: `GET /api/health` → servis durumu
- Readiness: `GET /api/health/ready` → veritabanı bağlantı durumu

## Deployment / Preview

- Frontend: port `3000` · Backend: port `4000`.
- Geliştirme önizlemesi (VM yaşam döngüsüne bağlı, kalıcı değildir): Preview URL üzerinden erişilir.
- Production deployment ve CI/CD henüz kurulmadı (bkz. `ROADMAP.md` — Phase 4).
