# AI Dietitian Platform — Backend

Backend **foundation** for the AI Dietitian Platform. This sprint delivers only
the infrastructure baseline (no business logic, no auth, no domain models).

## Stack

- **Runtime:** Node.js (>= 20), TypeScript (CommonJS build)
- **Framework:** Express 4
- **ORM:** Prisma 6 + PostgreSQL
- **Validation:** Zod
- **Logging:** pino / pino-http (with correlation IDs)
- **Security:** helmet, cors, express-rate-limit
- **Docs:** Swagger / OpenAPI (swagger-jsdoc + swagger-ui-express)

## Project structure

```
backend/
├── prisma/
│   ├── schema.prisma        # Default generator + datasource (no models yet)
│   └── migrations/          # Initial migration
├── src/
│   ├── config/env.ts        # dotenv + Zod-validated environment
│   ├── lib/
│   │   ├── logger.ts        # pino logger
│   │   └── prisma.ts        # Prisma client singleton + connectivity check
│   ├── middleware/
│   │   ├── correlation-id.ts
│   │   ├── request-logger.ts
│   │   ├── validate.ts      # Zod validation middleware
│   │   ├── rate-limit.ts
│   │   ├── not-found.ts
│   │   └── error-handler.ts # Centralized error handling
│   ├── utils/
│   │   ├── api-response.ts  # Standard success/error envelopes
│   │   ├── api-error.ts     # ApiError class
│   │   └── async-handler.ts
│   ├── routes/
│   │   ├── index.ts
│   │   └── health.route.ts  # Liveness + readiness probes
│   ├── docs/swagger.ts      # OpenAPI spec
│   ├── app.ts               # Express app assembly
│   └── index.ts             # Entry point + graceful shutdown
├── eslint.config.mjs
├── tsconfig.json
├── .prettierrc
└── .env.example
```

## Getting started

```bash
cp .env.example .env        # adjust DATABASE_URL as needed
npm install
npm run prisma:generate
npm run prisma:migrate      # applies the initial migration
npm run dev                 # start with hot reload
```

## Scripts

| Script                   | Description                              |
| ------------------------ | ---------------------------------------- |
| `npm run dev`            | Start with hot reload (tsx watch)        |
| `npm run build`          | Compile TypeScript to `dist/`            |
| `npm start`              | Run the compiled server                  |
| `npm run type-check`     | Type-check without emitting              |
| `npm run lint`           | ESLint (zero warnings allowed)           |
| `npm run format`         | Prettier write                           |
| `npm run prisma:generate`| Generate the Prisma client               |
| `npm run prisma:migrate` | Create/apply a dev migration             |

## Endpoints

- `GET /api/health` — liveness
- `GET /api/health/ready` — readiness (checks the database)
- `GET /docs` — Swagger UI
- `GET /docs.json` — raw OpenAPI spec
