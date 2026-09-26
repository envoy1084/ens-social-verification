# ENS Social Verification

ENS social record verification, built on an Effect-oriented pnpm/Turborepo workspace.

## Setup

Node.js 24.18.0 and pnpm 11.10.0.

```sh
pnpm install
pnpm check
```

## Commands

| Command             | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `pnpm dev`          | Run workspace development tasks                     |
| `pnpm build`        | Build workspace packages                            |
| `pnpm lint`         | Lint root configuration and workspace packages      |
| `pnpm lint:fix`     | Apply root and package lint fixes                   |
| `pnpm typecheck`    | Typecheck root configuration and workspace packages |
| `pnpm test`         | Run package tests                                   |
| `pnpm format`       | Format tracked/non-ignored project files with Oxfmt |
| `pnpm format:check` | Check formatting                                    |
| `pnpm check`        | Run formatting, lint, typecheck, tests, and builds  |

## Conventions

- Workspace paths: `apps/*` and `packages/*`.
- Shared tool versions: `pnpm-workspace.yaml` catalog.
- Config presets: Klarity; formatting/linting: Oxfmt and Oxlint.
- Git hooks: Lefthook; commit messages: Conventional Commits.
- Local `research/` notes and `.env` files are ignored by Git.
