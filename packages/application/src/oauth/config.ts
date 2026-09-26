import { Config, Context, Effect, Layer, Redacted } from "effect";

const make = Effect.gen(function* () {
  const clientId = yield* Config.String("DISCORD_CLIENT_ID").pipe(Config.withDefault(""));
  const clientSecret = yield* Config.Redacted("DISCORD_CLIENT_SECRET").pipe(
    Config.withDefault(Redacted.make("")),
  );
  const redirectUri = yield* Config.String("DISCORD_REDIRECT_URI").pipe(Config.withDefault(""));
  const signingKey = yield* Config.Redacted("OAUTH_ATTESTOR_PRIVATE_KEY").pipe(
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
  if (Redacted.value(signingKey) && !/^0x[0-9a-fA-F]{64}$/.test(Redacted.value(signingKey)))
    return yield* Effect.fail(
      new Error("OAUTH_ATTESTOR_PRIVATE_KEY must be a dedicated 32-byte hex key"),
    );
  if (redirectUri) {
    const callback = yield* Effect.try(() => new URL(redirectUri));
    if (
      callback.hash ||
      callback.search ||
      callback.username ||
      callback.password ||
      callback.pathname !== "/verification/oauth/discord/callback" ||
      (callback.protocol !== "https:" &&
        !(callback.protocol === "http:" && ["localhost", "127.0.0.1"].includes(callback.hostname)))
    )
      return yield* Effect.fail(new Error("Invalid Discord callback URL"));
  }
  return { clientId, clientSecret, redirectUri, signingKey, proofOrigin };
});

export class OAuthConfig extends Context.Service<OAuthConfig, Effect.Success<typeof make>>()(
  "application/OAuthConfig",
) {
  static readonly layer = Layer.effect(OAuthConfig, make);
}
