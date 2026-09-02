# syntax=docker/dockerfile:1

##########
# Builder
##########
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* values are inlined at build time; pass them as build args.
# Staging defaults target the current Google Cloud Run services and can still
# be overridden explicitly with --build-arg for another environment.
ARG NEXT_PUBLIC_API_BASE_URL=https://diewish-backend-730419163638.europe-west1.run.app/api
ARG NEXT_PUBLIC_SITE_URL=https://diewish-frontend-730419163638.europe-west1.run.app
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

##########
# Runtime
##########
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Copy the standalone server output (see next.config.ts `output: "standalone"`).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
