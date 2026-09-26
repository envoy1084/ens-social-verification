# syntax=docker/dockerfile:1.7
FROM node:24.18.0-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED="1"
RUN npm install --global pnpm@11.10.0

FROM base AS pruner
WORKDIR /app
RUN npm install --global turbo@2.11.4
COPY . .
RUN node -e "const fs = require('node:fs'); const p = require('./package.json'); if (!fs.existsSync('pnpm-workspace.yaml') || p.name !== 'ens-social-verification' || !p.packageManager) { console.error('Build context must be the repository root. In Dokploy set Build Path=/ and Docker Context Path=., not apps/web.'); process.exit(1); }"
RUN turbo prune @ens-social-verification/web --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=ens-social-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN --mount=type=cache,id=ens-social-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --ignore-scripts
ARG VITE_WALLETCONNECT_PROJECT_ID=""
ARG VITE_SERVER_URL
ARG VITE_SITE_URL
RUN test -n "$VITE_SERVER_URL"
RUN test -n "$VITE_SITE_URL"
RUN pnpm exec turbo run build --filter=@ens-social-verification/web

FROM nginxinc/nginx-unprivileged:stable-alpine AS runner
COPY --from=builder /app/apps/web/dist/ /usr/share/nginx/html/
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
