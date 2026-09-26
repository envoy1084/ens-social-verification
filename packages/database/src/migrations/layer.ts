import { fileURLToPath } from "node:url";

import { Context, Effect, Layer, Redacted } from "effect";

import { DatabaseError } from "@ens-social-verification/protocol/errors";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { DatabaseConfig } from "../config.js";

const migrationsFolder = fileURLToPath(new URL("../../migrations", import.meta.url));

export const runDatabaseMigrations = Effect.fn("Database.runMigrations")(function* () {
  const config = yield* DatabaseConfig;
  const pool = yield* Effect.acquireRelease(
    Effect.sync(
      () =>
        new Pool({
          connectionString: Redacted.value(config.url),
          max: 1,
          connectionTimeoutMillis: 5000,
          statement_timeout: 30_000,
        }),
    ),
    (client) => Effect.promise(() => client.end()),
  );

  // A dedicated single-connection pool keeps the advisory lock on the migrator's session.
  yield* Effect.tryPromise({
    try: async () => {
      await pool.query("select pg_advisory_lock(hashtext($1))", [
        "ens_social_verification_migrations",
      ]);

      try {
        const result = await migrate(drizzle({ client: pool }), { migrationsFolder });
        if (result !== undefined) throw new Error("Migration initialization failed");
      } finally {
        await pool.query("select pg_advisory_unlock(hashtext($1))", [
          "ens_social_verification_migrations",
        ]);
      }
    },
    catch: () => new DatabaseError(),
  });

  yield* Effect.logInfo("Database migrations applied");
}, Effect.scoped);

export class DatabaseMigration extends Context.Service<
  DatabaseMigration,
  { readonly completed: true }
>()("database/DatabaseMigration") {
  static readonly layer = Layer.effect(
    DatabaseMigration,
    runDatabaseMigrations().pipe(Effect.as({ completed: true as const })),
  ).pipe(Layer.provide(DatabaseConfig.layer));
}
