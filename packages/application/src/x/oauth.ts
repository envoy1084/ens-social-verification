import { Clock, Context, Crypto, Effect, Encoding, Layer, Redacted } from "effect";

import { XAttemptRepository } from "@ens-social-verification/database";
import { createVerificationClaim, xMethod, xRecordKey } from "@ens-social-verification/protocol";
import { XError, Unauthenticated } from "@ens-social-verification/protocol/errors";

import { Auth } from "../auth/index.js";
import { XAuthority } from "./authority.js";
import { XConfig } from "./config.js";
import { XProvider } from "./provider.js";
import { XTokens } from "./token.js";

const make = Effect.gen(function* () {
  const auth = yield* Auth;
  const attempts = yield* XAttemptRepository;
  const authority = yield* XAuthority;
  const provider = yield* XProvider;
  const config = yield* XConfig;
  const crypto = yield* Crypto.Crypto;
  const tokens = yield* XTokens;

  const digest = (value: string) => crypto.digest("SHA-256", new TextEncoder().encode(value));
  const binding = Effect.fn("XOAuth.binding")(function* (token: string | undefined) {
    const session = yield* auth.session(token);
    if (!token) return yield* new Unauthenticated();
    return { session, sessionHash: Encoding.encodeHex(yield* digest(`x-session:${token}`)) };
  });
  const attempt = Effect.fn("XOAuth.attempt")(function* (id: string, token: string | undefined) {
    const { sessionHash } = yield* binding(token);
    return yield* attempts.find(id, sessionHash);
  });

  return {
    attempt,
    start: Effect.fn("XOAuth.start")(function* (name: string, token: string | undefined) {
      if (!config.enabled)
        return yield* new XError({
          code: "UNAVAILABLE",
          message: "X verification is not configured",
        });
      const { session, sessionHash } = yield* binding(token);
      const owner = yield* authority.check(name, session.address);
      const state = Encoding.encodeBase64Url(yield* crypto.randomBytes(32));
      const verifier = Encoding.encodeBase64Url(yield* crypto.randomBytes(32));
      const pkceChallenge = Encoding.encodeBase64Url(yield* digest(verifier));
      const id = yield* crypto.randomUUIDv4;
      const now = yield* Clock.currentTimeMillis;
      yield* attempts.clearExpiredTokens();
      yield* attempts.create({
        id,
        name: owner.name,
        walletAddress: session.address,
        sessionHash,
        stateHash: Encoding.encodeHex(yield* digest(`x-state:${state}`)),
        pkceChallenge,
        status: "pending",
        identity: null,
        claim: null,
        encryptedToken: null,
        createdAt: new Date(now),
        expiresAt: new Date(now + 15 * 60_000),
      });
      const url = new URL("https://x.com/i/oauth2/authorize");
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        state,
        response_type: "code",
        scope: "users.read tweet.read tweet.write",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
      }).toString();
      return { id, authorizeUrl: url.href, verifier };
    }),

    callback: Effect.fn("XOAuth.callback")(function* (
      input: { state: string; code: string; verifier: string },
      token: string | undefined,
    ) {
      if (!config.enabled)
        return yield* new XError({
          code: "UNAVAILABLE",
          message: "X verification is not configured",
        });
      const { session, sessionHash } = yield* binding(token);
      const pending = yield* attempts.consume(
        Encoding.encodeHex(yield* digest(`x-state:${input.state}`)),
        sessionHash,
        Encoding.encodeBase64Url(yield* digest(input.verifier)),
      );
      const { identity, token: xToken } = yield* provider.exchange(input.code, input.verifier);
      // Recheck the session and owner after the external OAuth exchange.
      yield* binding(token);
      const owner = yield* authority.check(pending.name, session.address);
      const issuedAt = BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000));
      const deadline = issuedAt + 7n * 24n * 60n * 60n;
      const validUntil =
        deadline < owner.authorityValidUntil ? deadline : owner.authorityValidUntil;
      const claim = yield* createVerificationClaim({
        name: owner.name,
        recordKey: xRecordKey,
        value: identity.login,
        authority: owner.authority,
        method: xMethod,
        target: `x:user:${identity.id}:proof:${pending.id}`,
        issuedAt: String(issuedAt),
        validUntil: String(validUntil),
      });
      yield* attempts.complete(
        pending.id,
        identity,
        claim,
        yield* tokens.encrypt(pending.id, Redacted.value(xToken)),
      );
      return { id: pending.id, name: pending.name };
    }),
  };
});

export class XOAuth extends Context.Service<XOAuth, Effect.Success<typeof make>>()(
  "application/XOAuth",
) {
  static readonly layer = Layer.effect(XOAuth, make);
}
