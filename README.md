# ENS Social Verification

ENS social record verification, built on an Effect-oriented pnpm/Turborepo workspace.
Sepolia only (chain ID 11155111).

## Setup

Node.js 24.18.0 and pnpm 11.10.0.

```sh
pnpm install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
# Fill server credentials and database URLs before starting services.
pnpm dev:services:up
pnpm check
pnpm dev
```

Web: [localhost:3000](http://localhost:3000). Server: [localhost:8080](http://localhost:8080).
[Scalar reference](http://localhost:8080/reference) and [OpenAPI JSON](http://localhost:8080/openapi.json).
Set `ALCHEMY_API_KEY` in `apps/server/.env` for live ENS reads and wallet authentication.
`apps/server/.env` also supplies `DATABASE_URL` and `APP_ORIGIN`; local Postgres uses
port 5432. The server applies migrations before listening. No root `.env` is used.

Workspaces use `@ens-social-verification/*`: `server`, `web`, `api`, `application`,
`protocol`, and `database`. Authentication uses SIWE and HttpOnly cookie sessions.
See [server authentication](apps/server/README.md#authentication) for the adapter contract.
See [architecture](architecture/README.md) for package boundaries and the auth flow.

## Commands

| Command                  | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `pnpm dev`               | Run workspace development tasks                     |
| `pnpm dev:services:up`   | Start local Postgres and wait for readiness         |
| `pnpm dev:services:down` | Stop local services, preserving data                |
| `pnpm start`             | Start the built server with startup migrations      |
| `pnpm build`             | Build workspace packages                            |
| `pnpm lint`              | Lint root configuration and workspace packages      |
| `pnpm lint:fix`          | Apply root and package lint fixes                   |
| `pnpm typecheck`         | Typecheck root configuration and workspace packages |
| `pnpm test`              | Run package tests                                   |
| `pnpm format`            | Format tracked/non-ignored project files with Oxfmt |
| `pnpm format:check`      | Check formatting                                    |
| `pnpm check`             | Run formatting, lint, typecheck, tests, and builds  |

## Conventions

- Workspace paths: `apps/*` and `packages/*`.
- Shared tool versions: `pnpm-workspace.yaml` catalog.
- Config presets: Klarity; formatting/linting: Oxfmt and Oxlint.
- Git hooks: Lefthook; commit messages: Conventional Commits.
- Local `research/` notes and `.env` files are ignored by Git.
