import { Context, Effect, Layer, Redacted } from "effect";

import { OAuthError } from "@ens-social-verification/protocol/errors";
import * as client from "openid-client";

import { OAuthConfig } from "./config.js";
import { oauthProvider } from "./providers.js";

const make = Effect.gen(function* () {
  const config = yield* OAuthConfig;
  const configuration = Effect.fn("OAuthProvider.configuration")(function* (id: string) {
    const provider = yield* oauthProvider(id);
    if (!config.clientId || !Redacted.value(config.clientSecret) || !config.redirectUri)
      return yield* new OAuthError({
        code: "UNAVAILABLE",
        message: "OAuth verification is not configured.",
      });
    const oauth = new client.Configuration(
      {
        issuer: provider.issuer,
        authorization_endpoint: provider.authorizationEndpoint,
        token_endpoint: provider.tokenEndpoint,
        code_challenge_methods_supported: ["S256"],
      },
      config.clientId,
      undefined,
      client.ClientSecretPost(Redacted.value(config.clientSecret)),
    );
    oauth.timeout = 10;
    return { provider, oauth };
  });
  return {
    authorize: Effect.fn("OAuthProvider.authorize")(function* (
      id: string,
      state: string,
      challenge: string,
    ) {
      const { provider, oauth } = yield* configuration(id);
      return client.buildAuthorizationUrl(oauth, {
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: provider.scopes.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "consent",
      }).href;
    }),
    exchange: Effect.fn("OAuthProvider.exchange")(function* (
      id: string,
      state: string,
      code: string,
      verifier: string,
    ) {
      const { provider, oauth } = yield* configuration(id);
      const callback = new URL(config.redirectUri);
      callback.search = new URLSearchParams({ state, code }).toString();
      const tokens = yield* Effect.tryPromise({
        try: () =>
          client.authorizationCodeGrant(oauth, callback, {
            expectedState: state,
            pkceCodeVerifier: verifier,
          }),
        catch: () =>
          new OAuthError({
            code: "UNAVAILABLE",
            message:
              "OAuth token exchange failed. Check the client credentials and callback URL, then reconnect.",
          }),
      });
      if (provider.scopes.some((scope) => !tokens.scope?.split(" ").includes(scope)))
        return yield* new OAuthError({
          code: "INVALID_ATTEMPT",
          message: "Required identity access was not granted. Connect again.",
        });
      const response = yield* Effect.tryPromise({
        try: async () => {
          const result = await client.fetchProtectedResource(
            oauth,
            tokens.access_token,
            new URL(provider.identityEndpoint),
            "GET",
          );
          if (!result.ok) throw new Error("Identity request failed");
          return result.json();
        },
        catch: () =>
          new OAuthError({
            code: "UNAVAILABLE",
            message: "Cannot retrieve your social account. Please reconnect.",
          }),
      });
      return yield* provider.identity(response);
    }),
  };
});

export class OAuthProvider extends Context.Service<OAuthProvider, Effect.Success<typeof make>>()(
  "application/OAuthProvider",
) {
  static readonly layer = Layer.effect(OAuthProvider, make);
}
