import { Config, Context, Effect, Layer } from "effect";

export class AuthConfig extends Context.Service<
  AuthConfig,
  { readonly origin: string; readonly secureCookies: boolean }
>()("application/AuthConfig") {
  static readonly layer = Layer.effect(
    AuthConfig,
    Effect.gen(function* () {
      const origin = yield* Config.String("APP_ORIGIN");
      const environment = yield* Config.String("NODE_ENV").pipe(Config.withDefault("development"));
      const url = yield* Effect.try(() => new URL(origin));

      if (
        url.origin !== origin ||
        (!origin.startsWith("https://") &&
          !(
            environment === "development" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)
          ))
      ) {
        return yield* Effect.fail(
          new Error("APP_ORIGIN must be an HTTPS origin (HTTP localhost allowed in development)"),
        );
      }

      return { origin, secureCookies: url.protocol === "https:" };
    }),
  );
}
