# ── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .nvmrc ./

# Copy only package.json files for dependency resolution
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/domain/package.json ./packages/domain/
COPY packages/compliance/package.json ./packages/compliance/
COPY packages/payments/package.json ./packages/payments/
COPY packages/jobs/package.json ./packages/jobs/

# Install dependencies
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────
FROM base AS build
COPY . .

# Generate Prisma client
RUN cd packages/db && pnpm prisma generate

# Build workspace packages
RUN pnpm --filter @livestock/shared build
RUN pnpm --filter @livestock/domain build
RUN pnpm --filter @livestock/compliance build
RUN pnpm --filter @livestock/payments build
RUN pnpm --filter @livestock/jobs build

# Build Next.js app
RUN pnpm --filter @livestock/api build

# ── Stage 3: Production ───────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=build --chown=nextjs:nodejs /app/apps/api/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/api/.next/static ./apps/api/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/api/public ./apps/api/public

# Copy Prisma client for runtime queries
COPY --from=build --chown=nextjs:nodejs /app/packages/db/src/generated ./packages/db/src/generated
COPY --from=build --chown=nextjs:nodejs /app/packages/db/prisma ./packages/db/prisma

USER nextjs

EXPOSE 3000

CMD ["node", "apps/api/server.js"]
