import { Config, Context, Effect, Layer, Redacted } from "effect";

export class GithubConfig extends Context.Service<
  GithubConfig,
  {
    readonly clientId: string;
    readonly clientSecret: Redacted.Redacted<string>;
    readonly apiToken: Redacted.Redacted<string>;
    readonly redirectUri: string;
    readonly tokenEncryptionKey: Redacted.Redacted<string>;
    readonly enabled: boolean;
  }
>()("application/GithubConfig") {
  static readonly layer = Layer.effect(
    GithubConfig,
    Effect.gen(function* () {
      const clientId = yield* Config.String("GITHUB_CLIENT_ID").pipe(Config.withDefault(""));
      const clientSecret = yield* Config.Redacted("GITHUB_CLIENT_SECRET").pipe(
        Config.withDefault(Redacted.make("")),
      );
      const redirectUri = yield* Config.String("GITHUB_REDIRECT_URI").pipe(Config.withDefault(""));
      const apiToken = yield* Config.Redacted("GITHUB_API_TOKEN").pipe(
        Config.withDefault(Redacted.make("")),
      );
      const tokenEncryptionKey = yield* Config.Redacted("GITHUB_TOKEN_ENCRYPTION_KEY").pipe(
        Config.withDefault(Redacted.make("")),
      );
      const enabled = Boolean(
        clientId &&
        Redacted.value(clientSecret) &&
        redirectUri &&
        Redacted.value(tokenEncryptionKey),
      );
      if (enabled) {
        yield* Effect.try({
          try: () => {
            const callback = new URL(redirectUri);
            if (
              callback.hash ||
              callback.search ||
              callback.username ||
              callback.password ||
              (callback.protocol !== "https:" &&
                !(
                  callback.protocol === "http:" &&
                  ["localhost", "127.0.0.1"].includes(callback.hostname)
                ))
            )
              throw new Error("Invalid GitHub callback URL");
            if (!/^[0-9a-f]{64}$/.test(Redacted.value(tokenEncryptionKey)))
              throw new Error("Invalid token encryption key");
          },
          catch: () => new Error("Invalid GitHub verification configuration"),
        });
      }
      return { clientId, clientSecret, apiToken, redirectUri, tokenEncryptionKey, enabled };
    }),
  );
}
