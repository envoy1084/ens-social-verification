import { Effect, Schema } from "effect";

import { OAuthError } from "@ens-social-verification/protocol/errors";
import type { OAuthIdentity } from "@ens-social-verification/protocol/schema";

const DiscordAccount = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,19}$/)),
  username: Schema.String.check(Schema.isPattern(/^[a-z0-9_.]{2,32}$/)),
  bot: Schema.optional(Schema.Boolean),
});

const TelegramAccount = Schema.Struct({
  sub: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  preferred_username: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_]{1,32}$/)),
});

export interface OAuthProviderDefinition {
  readonly id: string;
  readonly issuer: string;
  readonly recordKey: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly identityEndpoint?: string;
  readonly jwksUri?: string;
  readonly scopes: readonly string[];
  readonly identity: (response: unknown) => Effect.Effect<OAuthIdentity, OAuthError>;
}

const providers: Readonly<Record<string, OAuthProviderDefinition>> = {
  telegram: {
    id: "telegram",
    issuer: "https://oauth.telegram.org",
    recordKey: "org.telegram",
    authorizationEndpoint: "https://oauth.telegram.org/auth",
    tokenEndpoint: "https://oauth.telegram.org/token",
    jwksUri: "https://oauth.telegram.org/.well-known/jwks.json",
    scopes: ["openid", "profile"],
    identity: (response) =>
      Schema.decodeUnknownEffect(TelegramAccount)(response).pipe(
        Effect.mapError(
          () =>
            new OAuthError({
              code: "INVALID_PROOF",
              message: "Set a public Telegram username in Telegram settings, then connect again.",
            }),
        ),
        Effect.map((account) => ({
          provider: "telegram",
          issuer: "https://oauth.telegram.org",
          subject: account.sub,
          value: account.preferred_username,
        })),
      ),
  },
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
