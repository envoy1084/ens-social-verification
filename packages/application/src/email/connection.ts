import { Clock, Context, Crypto, Effect, Layer } from "effect";
import { Hex } from "effect/encoding";

import { EmailAttemptRepository } from "@ens-social-verification/database";
import { emailClaim, emailSubject } from "@ens-social-verification/protocol";
import { EmailError, Unauthenticated } from "@ens-social-verification/protocol/errors";

import { Auth } from "../auth/index.js";
import { EmailAuthority } from "./authority.js";
import { EmailConfig } from "./config.js";
import { EmailProvider } from "./provider.js";

const make = Effect.gen(function* () {
  const auth = yield* Auth;
  const config = yield* EmailConfig;
  const attempts = yield* EmailAttemptRepository;
  const authority = yield* EmailAuthority;
  const provider = yield* EmailProvider;
  const crypto = yield* Crypto.Crypto;
  const binding = Effect.fn("EmailConnection.binding")(function* (token: string | undefined) {
    const session = yield* auth.session(token);
    if (!token) return yield* new Unauthenticated();
    const sessionHash = Hex.encode(
      yield* crypto.digest("SHA-256", new TextEncoder().encode(`email-session:${token}`)),
    );
    return { session, sessionHash };
  });
  const attempt = Effect.fn("EmailConnection.attempt")(function* (
    id: string,
    token: string | undefined,
  ) {
    const { sessionHash } = yield* binding(token);
    return yield* attempts.find(id, sessionHash);
  });
  const polling = new Set<string>();
  return {
    attempt,
    preview: Effect.fn("EmailConnection.preview")(function* (
      id: string,
      token: string | undefined,
    ) {
      const pending = yield* attempt(id, token);
      if (!pending.evidence)
        return yield* new EmailError({
          code: "INVALID_ATTEMPT",
          message: "No signed email received yet.",
        });
      return { rawEmail: pending.evidence.rawEmail };
    }),
    start: Effect.fn("EmailConnection.start")(function* (
      name: string,
      email: string,
      token: string | undefined,
    ) {
      const { session, sessionHash } = yield* binding(token);
      if (!config.enabled)
        return yield* new EmailError({
          code: "UNAVAILABLE",
          message: "Email verification is not configured.",
        });
      const owner = yield* authority.check(name, session.address);
      const now = yield* Clock.currentTimeMillis;
      const issuedAt = BigInt(Math.floor(now / 1000));
      const deadline = issuedAt + 7n * 86400n;
      const id = yield* crypto.randomUUIDv4;
      const intent = {
        id,
        name: owner.name,
        authority: owner.authority,
        email,
        recipient: config.recipient,
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
        expiresAt: new Date(now + 30 * 60_000),
      });
      return { id, intent, subject: emailSubject(yield* emailClaim(intent)) };
    }),
    complete: Effect.fn("EmailConnection.complete")(function* (
      id: string,
      token: string | undefined,
    ) {
      const pending = yield* attempt(id, token);
      if (pending.claim)
        return { ready: true, claim: pending.claim, email: pending.intent.email, reason: null };
      if (polling.has(id))
        return { ready: false, claim: null, email: pending.intent.email, reason: null };
      polling.add(id);
      return yield* Effect.gen(function* () {
        const claim = yield* emailClaim(pending.intent);
        const received = yield* provider
          .receive(pending.intent, claim)
          .pipe(Effect.timeout("30 seconds"));
        if (!received.evidence)
          return {
            ready: false,
            claim: null,
            email: pending.intent.email,
            reason: received.reason,
          };
        yield* attempt(id, token);
        yield* attempts.complete(id, pending.sessionHash, received.evidence, claim);
        return { ready: true, claim, email: pending.intent.email, reason: null };
      }).pipe(Effect.ensuring(Effect.sync(() => polling.delete(id))));
    }),
  };
});

export class EmailConnection extends Context.Service<
  EmailConnection,
  Effect.Success<typeof make>
>()("application/EmailConnection") {
  static readonly layer = Layer.effect(EmailConnection, make);
}
