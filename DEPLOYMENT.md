# Diewish — Deployment Guide

This guide describes how to build and run the **Diewish** platform (backend API + frontend web app + PostgreSQL) for a production-style environment and how the setup satisfies the iyzico merchant review requirements.

> Scope note: This document prepares the project for deployment and iyzico review. It does **not** deploy to a live server, buy a domain, or configure a VPS.

---

## 1. Architecture

| Service   | Tech                              | Port (internal) |
|-----------|-----------------------------------|-----------------|
| `db`      | PostgreSQL 16                     | 5432            |
| `backend` | Express + Prisma (Node 20)        | 4000            |
| `frontend`| Next.js 15 (standalone output)    | 3000            |

The frontend talks to the backend via `NEXT_PUBLIC_API_BASE_URL`. The backend persists to PostgreSQL via `DATABASE_URL`.

---

## 2. Prerequisites

- Docker + Docker Compose **or** Node.js 20+ and PostgreSQL 16 for a manual run.
- Google Cloud project with Vertex AI enabled for the primary AI path.
- A user-managed Cloud Run backend service identity with the minimum Google Cloud permissions required by the enabled services.
- iyzico merchant credentials if the web iyzico payment flow is enabled.
- SMTP credentials if transactional email is enabled.

---

## 3. Environment configuration

Copy the example env files and fill in real secrets:

```bash
cp backend/.env.production.example backend/.env.production
cp frontend/.env.production.example frontend/.env.production
```

### Backend (`backend/.env.production`)
Key variables (validated at boot via Zod):

- `NODE_ENV=production`
- `PORT=4000` for local/container fallback; Cloud Run injects its own `PORT`
- `API_PREFIX=/api`
- `DATABASE_URL=postgresql://USER:PASSWORD@db:5432/diewish`
- `CORS_ORIGIN=https://your-frontend-domain`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `AI_PROVIDER=vertex`
- `VERTEX_AI_LOCATION=global`
- `VERTEX_AI_MODEL=gemini-3.5-flash`
- `GOOGLE_CLOUD_PROJECT` is optional on Cloud Run because the backend resolves the project ID from the metadata server; set it explicitly for non-GCP runtimes
- `USDA_FDC_API_KEY` for verified generic-food nutrition data
- `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` only when the web iyzico channel is enabled

### Vertex AI / Cloud Run identity

Diewish does **not** put Gemini API keys or Google service-account JSON files in the APK, frontend, container image, or repository. The Cloud Run backend calls Vertex AI with its attached service identity. The runtime can obtain both the Google Cloud project ID and an OAuth access token from the Cloud Run metadata server.

For the backend Cloud Run service identity:

1. Enable the Vertex AI API in the project.
2. Attach a dedicated user-managed service account to the backend service.
3. Grant that service identity only the Vertex permissions it needs (normally `roles/aiplatform.user` at the project level for this inference path).
4. Do not set `GOOGLE_APPLICATION_CREDENTIALS` to a downloaded JSON key in Cloud Run.
5. Keep `AI_PROVIDER=vertex`; `GOOGLE_CLOUD_PROJECT` may be omitted on Cloud Run because metadata lookup is supported.

If the service identity is missing Vertex permission, the food scanner returns a structured provider-auth failure rather than falling back to invented nutrition values.

### Frontend (`frontend/.env.production`)
- `NEXT_PUBLIC_API_BASE_URL=https://your-api-domain/api`
- `NEXT_PUBLIC_SITE_URL=https://your-frontend-domain`

These `NEXT_PUBLIC_*` values are baked in at build time; set them before building the frontend image.

---

## 4. Run with Docker Compose (recommended)

```bash
# from repo root
docker compose up --build
```

This builds all three images and starts them. The backend container runs migrations automatically on start (`npm run start:migrate`, which runs `prisma migrate deploy` then `node dist/index.js`).

Services once healthy:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/api
- PostgreSQL: localhost:5432

To apply migrations manually (if needed):

```bash
docker compose exec backend npm run prisma:migrate:deploy
```

---

## 5. Manual run (without Docker)

### Backend
```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start        # or: npm run start:migrate
```

### Frontend
```bash
cd frontend
npm ci
npm run build
npm run start        # serves the standalone build on port 3000
```

---

## 6. Health & readiness endpoints

The backend exposes health endpoints (prefixed with `API_PREFIX`, default `/api`):

- `GET /api/health` — liveness + service version
- `GET /api/health/ready` — readiness (DB connectivity)
- `GET /api/health/version` — service version string

Use these for container health checks, load-balancer probes, and uptime monitoring.

---

## 7. Security & production hardening

Already configured in the codebase:

- **Backend:** Helmet-style security headers, CORS allowlist, rate limiting, request logging, gzip compression, fail-fast env validation.
- **Google Cloud AI:** backend-only Vertex calls using Cloud Run service identity; no Gemini/API secret is shipped to the Android app or browser.
- **Nutrition safety:** Gemini recognizes food, portions and candidate ingredients; numeric nutrition facts are resolved from nutrition providers and calculated deterministically by the backend.
- **Frontend (`next.config.ts`):** HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-DNS-Prefetch-Control`, `poweredByHeader: false`, compression, and `output: "standalone"` for a minimal runtime image.

---

## 8. SEO assets

- `GET /robots.txt` — generated by `src/app/robots.ts` (marketing routes allowed, app routes disallowed).
- `GET /sitemap.xml` — generated by `src/app/sitemap.ts` from the marketing route list.
- Open Graph / Twitter metadata, canonical URLs, and PWA manifest (`public/site.webmanifest`) are configured.

---

## 9. iyzico merchant review readiness

The public website now satisfies the reviewer requirements:

- **Landing page** (`/`) presenting the product, features, and benefits.
- **Pricing page** (`/pricing`) with Free / Premium / Premium Plus tiers, monthly & yearly billing, and a working purchase flow wired to the existing iyzico backend (`POST /api/payments/checkout`).
- **Corporate/legal pages:** About, Contact, Privacy Policy, Terms of Service, Cookie Policy, KVKK/GDPR, FAQ — all publicly accessible without login.
- **Clear purchasing flow:** Landing → Pricing → (Register/Login) → Checkout.
- Contact information and company details are publicly visible in the footer and Contact page.

### Remaining external items (outside code scope)
- Real iyzico **production** credentials if that channel is enabled.
- Production domain + TLS certificate.
- Hosting/service-identity/IAM provisioning.
- Replace placeholder testimonials and OG image with final assets.

---

## 10. Ports summary

| Purpose        | Port |
|----------------|------|
| Frontend (web) | 3000 |
| Backend (API)  | 4000 |
| PostgreSQL     | 5432 |
