import { Effect, Schema } from "effect";

import { OAuthError } from "@ens-social-verification/protocol/errors";
import type { OAuthIdentity } from "@ens-social-verification/protocol/schema";

const DiscordAccount = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,19}$/)),
  username: Schema.String.check(Schema.isPattern(/^[a-z0-9_.]{2,32}$/)),
  bot: Schema.optional(Schema.Boolean),
});

export interface OAuthProviderDefinition {
  readonly id: string;
  readonly issuer: string;
  readonly recordKey: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly identityEndpoint: string;
  readonly scopes: readonly string[];
  readonly identity: (response: unknown) => Effect.Effect<OAuthIdentity, OAuthError>;
}

const providers: Readonly<Record<string, OAuthProviderDefinition>> = {
  discord: {
    id: "discord",
    issuer: "https://discord.com",
    recordKey: "com.discord",
    authorizationEndpoint: "https://discord.com/oauth2/authorize",
    tokenEndpoint: "https://discord.com/api/oauth2/token",
    identityEndpoint: "https://discord.com/api/v10/users/@me",
    scopes: ["identify"],
    identity: (response) =>
      Schema.decodeUnknownEffect(DiscordAccount)(response).pipe(
        Effect.mapError(
          () =>
            new OAuthError({
              code: "INVALID_PROOF",
              message: "Discord did not return a supported user account.",
            }),
        ),
        Effect.flatMap((account) =>
          account.bot
            ? Effect.fail(
                new OAuthError({
                  code: "INVALID_PROOF",
                  message: "Connect a personal Discord account, not a bot.",
                }),
              )
            : Effect.succeed({
                provider: "discord",
                issuer: "https://discord.com",
                subject: account.id,
                value: account.username,
              }),
        ),
      ),
  },
};

export function oauthProvider(id: string) {
  const provider = Object.hasOwn(providers, id) ? providers[id] : undefined;
  return provider
    ? Effect.succeed(provider)
    : Effect.fail(
        new OAuthError({ code: "INVALID_ATTEMPT", message: "Unsupported OAuth provider." }),
      );
}
