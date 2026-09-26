import * as PgClient from "@effect/sql-pg/PgClient";
import { Context, Effect, Layer } from "effect";

import * as PgDrizzle from "drizzle-orm/effect-postgres";

import { DatabaseConfig } from "../config.js";

export class Database extends Context.Service<Database, PgDrizzle.EffectPgDatabase>()(
  "database/Database",
) {
  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* DatabaseConfig;

      return Layer.effect(Database, PgDrizzle.makeWithDefaults()).pipe(
        Layer.provide(PgClient.layer({ url: config.url })),
      );
    }),
  ).pipe(Layer.provide(DatabaseConfig.layer));
}
