import { Clock, Context, Crypto, Effect, Encoding, Layer, Redacted } from "effect";

import { OAuthAttemptRepository } from "@ens-social-verification/database";
import {
  createVerificationClaim,
  oauthMethod,
  oauthTarget,
} from "@ens-social-verification/protocol";
import { OAuthError, Unauthenticated } from "@ens-social-verification/protocol/errors";

import { Auth } from "../auth/index.js";
import { OAuthAttestor } from "./attestor.js";
import { OAuthAuthority } from "./authority.js";
import { OAuthConfig } from "./config.js";
import { OAuthProvider } from "./provider.js";
import { oauthProvider } from "./providers.js";

const make = Effect.gen(function* () {
  const auth = yield* Auth;
  const attempts = yield* OAuthAttemptRepository;
  const authority = yield* OAuthAuthority;
  const provider = yield* OAuthProvider;
  const attestor = yield* OAuthAttestor;
  const config = yield* OAuthConfig;
  const crypto = yield* Crypto.Crypto;
  const digest = (value: string) => crypto.digest("SHA-256", new TextEncoder().encode(value));
  const binding = Effect.fn("OAuthConnection.binding")(function* (token: string | undefined) {
    const session = yield* auth.session(token);
    if (!token) return yield* new Unauthenticated();
    return { session, sessionHash: Encoding.encodeHex(yield* digest(`oauth-session:${token}`)) };
  });
  const attempt = Effect.fn("OAuthConnection.attempt")(function* (
    id: string,
    token: string | undefined,
  ) {
    const { sessionHash } = yield* binding(token);
    return yield* attempts.find(id, sessionHash);
  });
  return {
    attempt,
    configuration: Effect.fn("OAuthConnection.configuration")(function* (id: string) {
      const definition = yield* oauthProvider(id);
      return {
        provider: id,
        recordKey: definition.recordKey,
        attestor: attestor.address,
        enabled: Boolean(
          attestor.address &&
          config.clientId &&
          config.redirectUri &&
          Redacted.value(config.clientSecret),
        ),
      };
    }),
    start: Effect.fn("OAuthConnection.start")(function* (
      providerId: string,
      name: string,
      token: string | undefined,
    ) {
      yield* oauthProvider(providerId);
      if (!attestor.address)
        return yield* new OAuthError({
          code: "UNAVAILABLE",
          message: "OAuth attestor is not configured.",
        });
      const { session, sessionHash } = yield* binding(token);
      const owner = yield* authority.check(name, session.address);
      const state = Encoding.encodeBase64Url(yield* crypto.randomBytes(32));
      const verifier = Encoding.encodeBase64Url(yield* crypto.randomBytes(32));
      const pkceChallenge = Encoding.encodeBase64Url(yield* digest(verifier));
      const authorizeUrl = yield* provider.authorize(providerId, state, pkceChallenge);
      const id = yield* crypto.randomUUIDv4;
      const now = yield* Clock.currentTimeMillis;
      yield* attempts.create({
        id,
        provider: providerId,
        name: owner.name,
        walletAddress: session.address,
        sessionHash,
        stateHash: Encoding.encodeHex(yield* digest(`oauth-state:${state}`)),
        pkceChallenge,
        status: "pending",
        identity: null,
        claim: null,
        createdAt: new Date(now),
        expiresAt: new Date(now + 15 * 60_000),
      });
      return { id, authorizeUrl, verifier };
    }),
    callback: Effect.fn("OAuthConnection.callback")(function* (
      providerId: string,
      input: { state: string; code: string; verifier: string },
      token: string | undefined,
    ) {
      const definition = yield* oauthProvider(providerId);
      const { session, sessionHash } = yield* binding(token);
      const pending = yield* attempts.consume(
        providerId,
        Encoding.encodeHex(yield* digest(`oauth-state:${input.state}`)),
        sessionHash,
        Encoding.encodeBase64Url(yield* digest(input.verifier)),
      );
      const identity = yield* provider.exchange(
        providerId,
        input.state,
        input.code,
        input.verifier,
      );
      if (identity.provider !== providerId || identity.issuer !== definition.issuer)
        return yield* new OAuthError({
          code: "INVALID_PROOF",
          message: "Provider identity mismatch.",
        });
      yield* binding(token);
      const owner = yield* authority.check(pending.name, session.address);
      const issuedAt = BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000));
      const deadline = issuedAt + 7n * 86400n;
      const claim = yield* createVerificationClaim({
        name: owner.name,
        recordKey: definition.recordKey,
        value: identity.value,
        authority: owner.authority,
        method: oauthMethod,
        target: oauthTarget(identity, pending.id),
        issuedAt: String(issuedAt),
        validUntil: String(
          deadline < owner.authorityValidUntil ? deadline : owner.authorityValidUntil,
        ),
      });
      yield* attempts.complete(pending.id, identity, claim);
      return { id: pending.id, name: pending.name };
    }),
  };
});

export class OAuthConnection extends Context.Service<
  OAuthConnection,
  Effect.Success<typeof make>
>()("application/OAuthConnection") {
  static readonly layer = Layer.effect(OAuthConnection, make);
}
