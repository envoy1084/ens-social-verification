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

## Future Effect implementation

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
