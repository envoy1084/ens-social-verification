import { Config, Context, Effect, Layer, type Redacted } from "effect";

export class DatabaseConfig extends Context.Service<
  DatabaseConfig,
  { readonly url: Redacted.Redacted<string> }
>()("database/DatabaseConfig") {
  static readonly layer = Layer.effect(
    DatabaseConfig,
    Effect.gen(function* () {
      return { url: yield* Config.Redacted("DATABASE_URL") };
    }),
  );
}
