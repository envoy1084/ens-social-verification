import { Clock, Context, Crypto, Effect, Layer, Schema } from "effect";
import { Hex } from "effect/encoding";

import { FarcasterAttemptRepository } from "@ens-social-verification/database";
import {
  createVerificationClaim,
  farcasterMethod,
  farcasterNonce,
  farcasterRecordKey,
  farcasterTarget,
} from "@ens-social-verification/protocol";
import { FarcasterError, Unauthenticated } from "@ens-social-verification/protocol/errors";
import { FarcasterEvidence } from "@ens-social-verification/protocol/schema";

import { AuthConfig } from "../auth/config.js";
import { Auth } from "../auth/index.js";
import { FarcasterAuthority } from "./authority.js";
import { FarcasterProvider } from "./provider.js";

const make = Effect.gen(function* () {
  const auth = yield* Auth;
  const config = yield* AuthConfig;
  const attempts = yield* FarcasterAttemptRepository;
  const authority = yield* FarcasterAuthority;
  const provider = yield* FarcasterProvider;
  const crypto = yield* Crypto.Crypto;

  const binding = Effect.fn("FarcasterConnection.binding")(function* (token: string | undefined) {
    const session = yield* auth.session(token);
    if (!token) return yield* new Unauthenticated();
    const sessionHash = Hex.encode(
      yield* crypto.digest("SHA-256", new TextEncoder().encode(`farcaster-session:${token}`)),
    );
    return { session, sessionHash };
  });
  const attempt = Effect.fn("FarcasterConnection.attempt")(function* (
    id: string,
    token: string | undefined,
  ) {
    const { sessionHash } = yield* binding(token);
    return yield* attempts.find(id, sessionHash);
  });
  return {
    attempt,
    start: Effect.fn("FarcasterConnection.start")(function* (
      name: string,
      token: string | undefined,
    ) {
      const { session, sessionHash } = yield* binding(token);
      const owner = yield* authority.check(name, session.address);
      const now = yield* Clock.currentTimeMillis;
      const issuedAt = BigInt(Math.floor(now / 1000));
      const deadline = issuedAt + 7n * 86400n;
      const id = yield* crypto.randomUUIDv4;
      const intent = {
        id,
        name: owner.name,
        authority: owner.authority,
        domain: new URL(config.origin).host,
        uri: `${config.origin}/${encodeURIComponent(owner.name)}`,
        issuedAt: String(issuedAt),
        validUntil: String(
          deadline < owner.authorityValidUntil ? deadline : owner.authorityValidUntil,
        ),
      };
      yield* attempts.create({
        id,
        sessionHash,
        intent,
        evidence: null,
        claim: null,
        envelope: null,
        createdAt: new Date(now),
        expiresAt: new Date(now + 15 * 60_000),
      });
      return { id, intent, nonce: farcasterNonce(intent) };
    }),
    complete: Effect.fn("FarcasterConnection.complete")(function* (
      id: string,
      input: {
        message: string;
        signature: typeof FarcasterEvidence.Type.signature;
        username: string;
      },
      token: string | undefined,
    ) {
      const pending = yield* attempt(id, token);
      if (pending.claim && pending.evidence) {
        if (
          pending.evidence.message !== input.message ||
          pending.evidence.signature !== input.signature
        )
          return yield* new FarcasterError({
            code: "INVALID_ATTEMPT",
            message: "This approval already belongs to another Farcaster connection.",
          });
        return { claim: pending.claim, username: pending.evidence.username };
      }
      const fid = yield* provider.verify(pending.intent, input.message, input.signature);
      // ENS-style Farcaster usernames need a separate resolver. Preserve identity using the signed FID instead.
      const username = /^[a-z0-9][a-z0-9-]{0,15}$/.test(input.username)
        ? input.username
        : `fid:${fid}`;
      yield* provider.verifyUsername(username, fid);
      const owner = yield* authority.check(pending.intent.name, pending.intent.authority);
      const evidence = yield* Schema.decodeUnknownEffect(FarcasterEvidence)({
        intent: pending.intent,
        fid,
        username,
        message: input.message,
        signature: input.signature,
      });
      const claim = yield* createVerificationClaim({
        name: owner.name,
        authority: owner.authority,
        recordKey: farcasterRecordKey,
        value: username,
        method: farcasterMethod,
        target: farcasterTarget(evidence),
        issuedAt: pending.intent.issuedAt,
        validUntil: pending.intent.validUntil,
      });
      yield* binding(token);
      yield* attempts.complete(id, pending.sessionHash, evidence, claim);
      return { claim, username };
    }),
  };
});

export class FarcasterConnection extends Context.Service<
  FarcasterConnection,
  Effect.Success<typeof make>
>()("application/FarcasterConnection") {
  static readonly layer = Layer.effect(FarcasterConnection, make);
}
