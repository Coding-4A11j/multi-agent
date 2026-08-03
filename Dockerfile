# Fastify API (apps/api) — long-running server, not deployable to Vercel.
# Build context is the repo root because this is an npm workspaces monorepo.
FROM node:20-bookworm-slim

WORKDIR /app

# openssl: Prisma engines. ripgrep: used by the code-search worker (falls back to Node if absent).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates ripgrep \
  && rm -rf /var/lib/apt/lists/*

# Install with the lockfile first so layers cache on dependency changes only.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY . .

# The API imports CreateTaskSchema from @multi-agent/shared at runtime, so shared must be
# compiled to JS first — its package entry points at dist/, which Node can actually load.
# `prisma generate` does not need DATABASE_URL.
RUN npm run build --workspace=packages/shared \
  && npm run db:generate --workspace=apps/api \
  && npm run build --workspace=apps/api

# Chromium for the Playwright worker, matching the pinned playwright version.
RUN npx playwright install --with-deps chromium

ENV NODE_ENV=production
# Railway injects PORT. HOST defaults to 0.0.0.0 in the app, which is what a container needs.
EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
