import { Clock, Context, Crypto, Effect, Layer, Redacted } from "effect";
import { Base64Url, Hex } from "effect/encoding";

import { GithubAttemptRepository } from "@ens-social-verification/database";
import {
  createVerificationClaim,
  githubMethod,
  githubRecordKey,
} from "@ens-social-verification/protocol";
import { GithubError, Unauthenticated } from "@ens-social-verification/protocol/errors";

import { Auth } from "../auth/index.js";
import { GithubAuthority } from "./authority.js";
import { GithubConfig } from "./config.js";
import { GithubProvider } from "./provider.js";
import { GithubTokens } from "./token.js";

const make = Effect.gen(function* () {
  const auth = yield* Auth;
  const attempts = yield* GithubAttemptRepository;
  const authority = yield* GithubAuthority;
  const provider = yield* GithubProvider;
  const config = yield* GithubConfig;
  const crypto = yield* Crypto.Crypto;
  const tokens = yield* GithubTokens;

  const digest = (value: string) => crypto.digest("SHA-256", new TextEncoder().encode(value));
  const binding = Effect.fn("GithubOAuth.binding")(function* (token: string | undefined) {
    const session = yield* auth.session(token);
    if (!token) return yield* new Unauthenticated();
    return { session, sessionHash: Hex.encode(yield* digest(`github-session:${token}`)) };
  });
  const attempt = Effect.fn("GithubOAuth.attempt")(function* (
    id: string,
    token: string | undefined,
  ) {
    const { sessionHash } = yield* binding(token);
    return yield* attempts.find(id, sessionHash);
  });

  return {
    attempt,
    start: Effect.fn("GithubOAuth.start")(function* (name: string, token: string | undefined) {
      if (!config.enabled)
        return yield* new GithubError({
          code: "UNAVAILABLE",
          message: "GitHub verification is not configured",
        });
      const { session, sessionHash } = yield* binding(token);
      const owner = yield* authority.check(name, session.address);
      const state = Base64Url.encode(yield* crypto.randomBytes(32));
      const verifier = Base64Url.encode(yield* crypto.randomBytes(32));
      const pkceChallenge = Base64Url.encode(yield* digest(verifier));
      const id = yield* crypto.randomUUIDv4;
      const now = yield* Clock.currentTimeMillis;
      yield* attempts.clearExpiredTokens();
      yield* attempts.create({
        id,
        name: owner.name,
        walletAddress: session.address,
        sessionHash,
        stateHash: Hex.encode(yield* digest(`github-state:${state}`)),
        pkceChallenge,
        status: "pending",
        identity: null,
        claim: null,
        encryptedToken: null,
        createdAt: new Date(now),
        expiresAt: new Date(now + 15 * 60_000),
      });
      const url = new URL("https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        state,
        scope: "gist",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return { id, authorizeUrl: url.href, verifier };
    }),

    callback: Effect.fn("GithubOAuth.callback")(function* (
      input: { state: string; code: string; verifier: string },
      token: string | undefined,
    ) {
      if (!config.enabled)
        return yield* new GithubError({
          code: "UNAVAILABLE",
          message: "GitHub verification is not configured",
        });
      const { session, sessionHash } = yield* binding(token);
      const pending = yield* attempts.consume(
        Hex.encode(yield* digest(`github-state:${input.state}`)),
        sessionHash,
        Base64Url.encode(yield* digest(input.verifier)),
      );
      const { identity, token: githubToken } = yield* provider.exchange(input.code, input.verifier);
      // Recheck the session and owner after the external OAuth exchange.
      yield* binding(token);
      const owner = yield* authority.check(pending.name, session.address);
      const issuedAt = BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000));
      const deadline = issuedAt + 7n * 24n * 60n * 60n;
      const validUntil =
        deadline < owner.authorityValidUntil ? deadline : owner.authorityValidUntil;
      const claim = yield* createVerificationClaim({
        name: owner.name,
        recordKey: githubRecordKey,
        value: identity.login,
        authority: owner.authority,
        method: githubMethod,
        target: `github:user:${identity.id}`,
        issuedAt: String(issuedAt),
        validUntil: String(validUntil),
      });
      yield* attempts.complete(
        pending.id,
        identity,
        claim,
        yield* tokens.encrypt(pending.id, Redacted.value(githubToken)),
      );
      return { id: pending.id, name: pending.name };
    }),
  };
});

export class GithubOAuth extends Context.Service<GithubOAuth, Effect.Success<typeof make>>()(
  "application/GithubOAuth",
) {
  static readonly layer = Layer.effect(GithubOAuth, make);
}
