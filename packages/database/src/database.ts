import * as PgClient from "@effect/sql-pg/PgClient";
import { Config, Context, Layer } from "effect";

import * as PgDrizzle from "drizzle-orm/effect-postgres";

export class Database extends Context.Service<Database, PgDrizzle.EffectPgDatabase>()(
  "database/Database",
) {
  static readonly layer = Layer.effect(Database, PgDrizzle.makeWithDefaults()).pipe(
    Layer.provide(PgClient.layerConfig({ url: Config.Redacted("DATABASE_URL") })),
  );
}
