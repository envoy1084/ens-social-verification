import { Context, Effect, Layer, Redacted } from "effect";

import { OAuthError } from "@ens-social-verification/protocol/errors";
import * as client from "openid-client";

import { OAuthConfig } from "./config.js";
import { oauthProvider } from "./providers.js";

const make = Effect.gen(function* () {
  const config = yield* OAuthConfig;
  const configuration = Effect.fn("OAuthProvider.configuration")(function* (id: string) {
    const provider = yield* oauthProvider(id);
    const credentials = config.providers[id];
    if (
      !credentials?.clientId ||
      !Redacted.value(credentials.clientSecret) ||
      !credentials.redirectUri
    )
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
        ...(provider.jwksUri
          ? { jwks_uri: provider.jwksUri, id_token_signing_alg_values_supported: ["RS256"] }
          : {}),
      },
      credentials.clientId,
      provider.jwksUri ? { id_token_signed_response_alg: "RS256" } : undefined,
      provider.jwksUri
        ? client.ClientSecretBasic(Redacted.value(credentials.clientSecret))
        : client.ClientSecretPost(Redacted.value(credentials.clientSecret)),
    );
    if (provider.jwksUri) client.enableNonRepudiationChecks(oauth);
    oauth.timeout = 10;
    return { provider, oauth, credentials };
  });
  return {
    authorize: Effect.fn("OAuthProvider.authorize")(function* (
      id: string,
      state: string,
      challenge: string,
      nonce?: string,
    ) {
      const { provider, oauth, credentials } = yield* configuration(id);
      if (provider.jwksUri && !nonce)
        return yield* new OAuthError({
          code: "INVALID_ATTEMPT",
          message: "OIDC authorization requires a nonce.",
        });
      return client.buildAuthorizationUrl(oauth, {
        redirect_uri: credentials.redirectUri,
        response_type: "code",
        scope: provider.scopes.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...(provider.jwksUri ? { nonce: nonce ?? "" } : { prompt: "consent" }),
      }).href;
    }),
    exchange: Effect.fn("OAuthProvider.exchange")(function* (
      id: string,
      state: string,
      code: string,
      verifier: string,
    ) {
      const { provider, oauth, credentials } = yield* configuration(id);
      const callback = new URL(credentials.redirectUri);
      callback.search = new URLSearchParams({ state, code }).toString();
      const tokens = yield* Effect.tryPromise({
        try: async () =>
          client.authorizationCodeGrant(oauth, callback, {
            expectedState: state,
            pkceCodeVerifier: verifier,
            ...(provider.jwksUri
              ? {
                  expectedNonce: await client.calculatePKCECodeChallenge(`oauth-nonce:${verifier}`),
                  idTokenExpected: true,
                }
              : {}),
          }),
        catch: () =>
          new OAuthError({
            code: "UNAVAILABLE",
            message:
              "OAuth token exchange failed. Check the client credentials and callback URL, then reconnect.",
          }),
      });
      // OIDC permits omitted scope when unchanged; the required signed profile claims are checked below.
      const grantedScopes = tokens.scope ?? (provider.jwksUri ? provider.scopes.join(" ") : "");
      if (provider.scopes.some((scope) => !grantedScopes.split(" ").includes(scope)))
        return yield* new OAuthError({
          code: "INVALID_ATTEMPT",
          message: "Required identity access was not granted. Connect again.",
        });
      if (provider.jwksUri) return yield* provider.identity(tokens.claims());
      const identityEndpoint = provider.identityEndpoint;
      if (!identityEndpoint)
        return yield* new OAuthError({
          code: "UNAVAILABLE",
          message: "Provider identity endpoint is not configured.",
        });
      const response = yield* Effect.tryPromise({
        try: async () => {
          const result = await client.fetchProtectedResource(
            oauth,
            tokens.access_token,
            new URL(identityEndpoint),
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
