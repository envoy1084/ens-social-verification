# Repository Guide

## Scope and workflow

- Keep the hackathon workspace minimal: server and web apps, with api, application,
  protocol and database packages only as features require them.
- Inspect Git status, relevant code, configuration, tests, and package READMEs first.
- Preserve pre-existing changes and commit them separately before implementation.
- Make focused changes and commit each meaningful unit using Conventional Commits.
- Do not add dependencies, abstractions, or unrelated refactors without a concrete need.
- Never commit credentials or local environment files. `research/` stays untracked.

## Tooling

- Node and pnpm are pinned in `.node-version` and `package.json`.
- Shared versions belong in `pnpm-workspace.yaml`; use `catalog:` for consumers.
- Use Klarity presets, Oxlint, Oxfmt, Lefthook, and Commitlint. Do not add parallel
  ESLint/Prettier/Husky toolchains.
- Run `pnpm check` after meaningful changes. Explain any skipped checks.
- Keep Turbo task inputs, environment declarations, and outputs accurate. Integration
  tests using live infrastructure must not reuse an inappropriate cached result.
- Root TypeScript only checks tooling. Each future package chooses its own Klarity preset.

## Package boundaries

- `protocol`: shared schemas, public DTOs, and typed errors. No infrastructure imports.
- `database`: Drizzle tables, migrations, PostgreSQL Layer, and focused queries in
  `src/repositories/`. Group repositories by domain when needed.
- `application`: business workflows and provider coordination, independent of HTTP
  and React. Depends on protocol and database, never api or server.
- `api`: public HttpApi contracts only. Depends on protocol, not application.
- `apps/server`: composition root, HTTP handlers, cookies, rate limits, and live Layers.
- `apps/web`: TanStack Router UI, Namespace UIKit, ENSForge, and wallet connections.

Implement features in dependency order: protocol, database, application, api, server,
then frontend. Export supported entry points and use package imports across boundaries.
Keep this six-part structure; do not copy unrelated Namera packages or abstractions.

## Effect implementation

- Before writing Effect code, read the installed `effect/AGENTS.md` and relevant
  `effect/ai-docs` and source. Verify APIs against the selected version.
- Select a compatible Effect/ENSForge release family with the first consumer;
  do not mix stable and prerelease Effect APIs from memory.
- Keep runtime schemas and public contracts separate from persistence and transport.
- Keep business workflows independent of HTTP and React; compose live Layers at
  the server entry point. Decode untrusted input with Schema and use typed errors.
- Use Effect Config with redacted secrets. Never log tokens, proofs containing
  private claims, or OAuth callback parameters.
- Prefer folders until a shared consumer or independent runtime boundary warrants
  a workspace package. Keep files focused, generally below 300-500 lines.
- Tests cover meaningful behavior, failure cases, security boundaries, and regressions.
  Add database/API/browser infrastructure only when those boundaries exist.
- Use ENSForge for ENS operations and keep social proof verification independently
  testable. Database status is not verification authority.
- Keep docs synchronized with behavior. Promote settled decisions from ignored
  research into committed package documentation when implementing them.

## Source conventions

- Use class-based `Context.Service`, focused Layers, `Effect.gen` for workflows,
  and named `Effect.fn("Service.operation")` for reusable effectful functions.
- Put database queries in `src/repositories/`, not application or HTTP handlers.
  Keep atomic state transitions in one transaction; do not hold locks during RPC.
- Store credential digests, not raw session tokens. Public DTOs exclude sensitive
  persistence fields. Never log signatures, cookies, tokens, or database URLs.
- Keep package-owned dependencies in that package. Preserve `workspace-source`
  and include `.js` on relative ESM imports.
- Separate setup, validation, provider calls, transactions, and result mapping
  with logical blank lines. Do not compress unrelated statements onto one line.
- Prefer early returns and explicit control flow. Keep one-off simple expressions
  inline; do not create factories or generic helper layers without a concrete need.
- Comments explain invariants, security decisions, or provider constraints. Do not
  narrate syntax, label obvious steps, or leave commented-out code.
- Keep files focused and split by responsibility, not arbitrary line counts.
  Use readonly types where mutation is not required.
- Preserve frontend structure, UIKit tokens, accessible controls, and responsive
  behavior. This project does not use web-app tests; verify UI changes in-browser.
- Add backend tests for failures, transaction races, expiry, and security boundaries.
  Use real PostgreSQL where concurrency or driver behavior matters. Do not mock
  application internals when testing the HTTP boundary.
- Keep documentation concise and synchronized. A scaffold is not an implemented
  feature; distinguish wired and tested behavior from future work.
