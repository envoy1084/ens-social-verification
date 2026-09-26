# Server Runtime

[Entry point](../../apps/server/src/index.ts) launches the
[server Layer](../../apps/server/src/layers/server.ts). The
[services Layer](../../apps/server/src/layers/services.ts) composes Node cryptography,
PostgreSQL repositories, transaction service, trusted-origin config, and Sepolia RPC.
The API package generates OpenAPI at `/` and `/openapi.json`; Scalar is at `/reference`.

## Local Services

`compose.yaml` runs Postgres 17 on `127.0.0.1:5432` with a dedicated project volume.
It never mounts Namera's data. Database credentials belong in `apps/server/.env`.
`pnpm dev:services:up` uses `scripts/compose.ts` to derive Compose credentials from
`DATABASE_URL`; no separate password setting or root env file exists.
The server runs migrations before opening its listener in both development and production.
The migrator holds a PostgreSQL advisory lock on its dedicated single-connection pool;
concurrent starts serialize, and a failed migration aborts startup. The CLI uses the same code.
Unbundled builds preserve the migration module's relative path to committed SQL files.

The server listens on 8080 and Vite on 3000. The browser calls `VITE_SERVER_URL`
directly; neither Vite nor the static Nginx host proxies API requests. The server's
CORS policy permits credentials only from `APP_ORIGIN`. The auth client includes
credentials. Use `localhost` for both local origins, not a mix of localhost
and 127.0.0.1. Production web/API hosts must be same-site HTTPS sibling domains;
cross-site cookie authentication is intentionally unsupported.

| Variable          | Owner       | Meaning                                          |
| ----------------- | ----------- | ------------------------------------------------ |
| `DATABASE_URL`    | database    | PostgreSQL connection URL, loaded as Redacted    |
| `APP_ORIGIN`      | application | Exact trusted web origin, no trailing slash/path |
| `NODE_ENV`        | application | HTTP loopback allowed only in development        |
| `ALCHEMY_API_KEY` | server      | Sepolia reads and signature verification         |
| `HOST`, `PORT`    | server      | Defaults: 127.0.0.1 and 8080                     |

`dev` and `start` load `apps/server/.env`. Database commands and integration tests use
that same file; the browser has only `apps/web/.env`. Exported variables take precedence.
`/health` is liveness. `/health/ready` remains an Alchemy configuration check, not a
database or upstream connectivity probe.

Auth request policy lives in `middlewares/auth.ts`; route files only decode payloads,
apply cookies, and call application operations. Auth and RPC have separate in-process
request budgets. Raw Alchemy/database errors, cookies, and signatures are not logged.
Frontend RPC reads are batched (up to 20 calls per request). RPC throttling returns
`Retry-After`, exposed through CORS so viem can wait for the rate window to reset.

## Verification

`pnpm check` runs formatting, lint, typecheck, isolated route tests, and all builds.
`pnpm exec turbo run test:integration` builds dependencies and runs uncached real-Postgres
auth tests with an explicit `DATABASE_URL` override ending in `_test`. The test
database is separate; its auth tables are cleared at suite startup.
RPC substitution stays at the transport boundary; EOA signing/recovery is real.

## Pending

Production ingress limits, database readiness monitoring, automatic expired-row
cleanup, and distributed rate limiting are not implemented. The RC.4 Drizzle patch
must be reviewed when upgrading Effect/Drizzle; it only fixes the TaggedError rename.
