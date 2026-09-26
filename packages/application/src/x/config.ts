import { Config, Context, Effect, Layer, Redacted } from "effect";

export class XConfig extends Context.Service<
  XConfig,
  {
    readonly clientId: string;
    readonly clientSecret: Redacted.Redacted<string>;
    readonly apiToken: Redacted.Redacted<string>;
    readonly redirectUri: string;
    readonly tokenEncryptionKey: Redacted.Redacted<string>;
    readonly proofOrigin: string;
    readonly enabled: boolean;
  }
>()("application/XConfig") {
  static readonly layer = Layer.effect(
    XConfig,
    Effect.gen(function* () {
      const clientId = yield* Config.String("X_CLIENT_ID").pipe(Config.withDefault(""));
      const clientSecret = yield* Config.Redacted("X_CLIENT_SECRET").pipe(
        Config.withDefault(Redacted.make("")),
      );
      const apiToken = yield* Config.Redacted("X_BEARER_TOKEN").pipe(
        Config.withDefault(Redacted.make("")),
      );
      const redirectUri = yield* Config.String("X_REDIRECT_URI").pipe(Config.withDefault(""));
      const tokenEncryptionKey = yield* Config.Redacted("X_TOKEN_ENCRYPTION_KEY").pipe(
        Config.withDefault(Redacted.make("")),
      );
      const proofOrigin = yield* Config.String("PUBLIC_SERVER_URL");
      const origin = yield* Effect.try(() => new URL(proofOrigin));
      if (
        origin.origin !== proofOrigin ||
        origin.protocol !== "https:" ||
        origin.username ||
        origin.password
      )
        return yield* Effect.fail(new Error("PUBLIC_SERVER_URL must be an HTTPS origin"));
      const enabled = Boolean(
        clientId &&
        Redacted.value(clientSecret) &&
        Redacted.value(apiToken) &&
        redirectUri &&
        Redacted.value(tokenEncryptionKey),
      );
      if (enabled) {
        const callback = yield* Effect.try(() => new URL(redirectUri));
        if (
          callback.hash ||
          callback.search ||
          callback.username ||
          callback.password ||
          callback.pathname !== "/verification/x/callback" ||
          (callback.protocol !== "https:" &&
            !(
              callback.protocol === "http:" &&
              ["localhost", "127.0.0.1"].includes(callback.hostname)
            )) ||
          !/^[0-9a-f]{64}$/.test(Redacted.value(tokenEncryptionKey))
        )
          return yield* Effect.fail(new Error("Invalid X verification configuration"));
      }
      return {
        clientId,
        clientSecret,
        apiToken,
        redirectUri,
        tokenEncryptionKey,
        proofOrigin,
        enabled,
      };
    }),
  );
}
