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
RUN node -e "const fs = require('node:fs'); const p = require('./package.json'); if (!fs.existsSync('pnpm-workspace.yaml') || p.name !== 'ens-social-verification' || !p.packageManager) { console.error('Build context must be the repository root. In Dokploy set Build Path=/ and Docker Context Path=., not apps/server.'); process.exit(1); }"
RUN turbo prune @ens-social-verification/server --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=ens-social-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN --mount=type=cache,id=ens-social-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --ignore-scripts
RUN pnpm exec turbo run build --filter=@ens-social-verification/server...
RUN --mount=type=cache,id=ens-social-pnpm,target=/pnpm/store \
    pnpm --ignore-scripts --filter @ens-social-verification/server --prod deploy --legacy /app/server

FROM node:24.18.0-bookworm-slim AS runner
ENV NODE_ENV="production"
ENV NODE_OPTIONS="--enable-source-maps"
ENV HOST="0.0.0.0"
ENV PORT="8080"
WORKDIR /app
COPY --from=builder --chown=node:node /app/server/ ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
