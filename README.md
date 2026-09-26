# ENS Social Verification

Private pnpm/Turborepo foundation for an Effect-based ENS social verification project.
There are intentionally no applications or workspace packages yet. The workspace
globs reserve `apps/*` and `packages/*` for future implementation.

## Setup

Use Node.js **24.18.0** (`.node-version`) and pnpm **11.10.0** (`packageManager`).

```sh
pnpm install
pnpm check
```

Installation sets up Lefthook. CI installs with the committed lockfile and disables
local hooks. Tool versions are pinned in the pnpm catalog.

## Commands

| Command             | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `pnpm dev`          | Run workspace development tasks when apps exist     |
| `pnpm build`        | Build workspace packages                            |
| `pnpm lint`         | Lint root configuration and workspace packages      |
| `pnpm lint:fix`     | Apply root and package lint fixes                   |
| `pnpm typecheck`    | Typecheck root configuration and workspace packages |
| `pnpm test`         | Run package tests                                   |
| `pnpm format`       | Format tracked/non-ignored project files with Oxfmt |
| `pnpm format:check` | Check formatting                                    |
| `pnpm check`        | Run formatting, lint, typecheck, tests, and builds  |

With no packages, Turbo build/test/dev tasks do no work. Root lint and typecheck
still validate the tooling configuration; this is not application test coverage.

## Conventions

- Klarity supplies TypeScript, Oxlint, Oxfmt, Commitlint, and Lefthook defaults.
- `turbo.json` is seeded from Klarity 0.2.0 and tailored to this empty workspace:
  no Next.js outputs or global environment-file cache inputs. Declare actual
  environment inputs and output directories beside future package tasks.
- Lefthook formats and lints staged files, validates Conventional Commits, and
  runs the full check before push. Review staged formatting before committing
  partially staged files because the preset re-stages formatted files.
- Add runtime dependencies only with their first consumer. Effect, ENSForge,
  React, database clients, Vitest, and tsdown are intentionally not installed yet.
- Future apps use Effect services and schema-first contracts; consult `AGENTS.md`
  before implementation. Package TypeScript configs select their own Klarity
  environment preset rather than extending the root tooling project.
- Local `research/` notes are ignored by Git and are not shipped, backed up by
  commits, or available to collaborators through a clone.

No environment variables, database, development server, or deployment credentials
are required for this scaffold.
