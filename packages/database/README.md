# Database

Drizzle ORM/Kit RC with the Effect PostgreSQL driver. `apps/server/.env` provides
`DATABASE_URL`; exported environment variables take precedence.

- `src/schema/auth/`: one Drizzle table per file.
- `src/repositories/auth/`: challenge and session query services with model validation.
- `src/schema/github/` and `src/repositories/github/`: OAuth attempts and gist publications.
- `src/core/`: PostgreSQL Layer and transaction context.
- `src/migrations/`: advisory-locked startup/CLI migrator.
- `src/config.ts`: redacted database configuration.

Application-owned transactions span repositories through `TransactionService.run`.
Repositories use `transactionOrDatabase`; raw transaction clients stay private.
The [catalog](../../architecture/database/README.md) documents columns and invariants.

Run `pnpm --filter @ens-social-verification/database db:generate` after changing tables.
`db:migrate` invokes the same locked migrator as server startup; `db:studio` opens Drizzle Studio.
Commit generated migrations; do not use schema push.
The local Compose service binds only to `127.0.0.1:5432` and has its own persistent volume.

`patches/drizzle-orm@1.0.0-rc.4.patch` carries Namera's compatibility fix for Effect's
`TaggedErrorClass` to `TaggedError` rename. Remove it when upgrading to a compatible release.
The `pg` dependency provides the dedicated migration connection; Effect SQL owns runtime queries.
