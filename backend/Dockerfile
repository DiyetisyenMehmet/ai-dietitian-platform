# syntax=docker/dockerfile:1

##########
# Builder
##########
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (including dev) using the lockfile for reproducibility.
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client, then compile TypeScript to dist/.
COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# Prune dev dependencies so only production deps are carried forward.
RUN npm prune --omit=dev

##########
# Runtime
##########
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Run as an unprivileged user.
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

USER nodejs

EXPOSE 4000

# Apply pending migrations, then start the compiled server.
CMD ["npm", "run", "start:migrate"]
