import { Clock, Context, Crypto, Effect, Encoding, Layer } from "effect";

import {
  ChallengeRepository,
  SessionRepository,
  TransactionService,
} from "@ens-social-verification/database";
import type { AuthMessageRequest, AuthVerifyRequest } from "@ens-social-verification/protocol/dto";
import { InvalidChallenge, Unauthenticated } from "@ens-social-verification/protocol/errors";
import { getAddress, isAddress } from "viem";
import { createSiweMessage, parseSiweMessage } from "viem/siwe";

import { AuthConfig } from "./config.js";
import { SignatureVerifier } from "./signature-verifier.js";

export const challengeLifetime = 5 * 60;
export const sessionLifetime = 24 * 60 * 60;

const make = Effect.gen(function* () {
  const challenges = yield* ChallengeRepository;
  const sessions = yield* SessionRepository;
  const transactions = yield* TransactionService;
  const config = yield* AuthConfig;
  const signatures = yield* SignatureVerifier;
  const crypto = yield* Crypto.Crypto;

  const hashToken = Effect.fn("Auth.hashToken")(
    (kind: "nonce" | "browser" | "session", value: string) =>
      crypto
        .digest("SHA-256", new TextEncoder().encode(`${kind}:${value}`))
        .pipe(Effect.map(Encoding.encodeHex)),
  );

  return {
    nonce: Effect.fn("Auth.nonce")(function* () {
      const now = yield* Clock.currentTimeMillis;
      const nonce = Encoding.encodeHex(yield* crypto.randomBytes(32));
      const browserToken = Encoding.encodeBase64Url(yield* crypto.randomBytes(32));

      yield* challenges.create({
        id: yield* crypto.randomUUIDv4,
        nonceHash: yield* hashToken("nonce", nonce),
        browserTokenHash: yield* hashToken("browser", browserToken),
        createdAt: new Date(now),
        expiresAt: new Date(now + challengeLifetime * 1000),
      });

      return { nonce, browserToken };
    }),
    message: Effect.fn("Auth.message")(function* (
      input: typeof AuthMessageRequest.Type,
      browserToken: string | undefined,
    ) {
      if (!browserToken || !isAddress(input.address) || input.chainId !== 11155111) {
        return yield* new InvalidChallenge();
      }

      const now = new Date(yield* Clock.currentTimeMillis);
      const challenge = yield* challenges.findActive(
        yield* hashToken("nonce", input.nonce),
        yield* hashToken("browser", browserToken),
        now,
      );

      const message = createSiweMessage({
        address: getAddress(input.address),
        chainId: 11155111,
        domain: new URL(config.origin).host,
        uri: config.origin,
        version: "1",
        nonce: input.nonce,
        statement:
          "Sign in to ENS Social Verification. This does not authorize transactions or changes to ENS records.",
        issuedAt: challenge.createdAt,
        expirationTime: new Date(challenge.createdAt.getTime() + sessionLifetime * 1000),
      });

      yield* challenges.prepareMessage(challenge.id, message, now);

      return { message };
    }),
    verify: Effect.fn("Auth.verify")(function* (
      input: typeof AuthVerifyRequest.Type,
      browserToken: string | undefined,
      previousToken: string | undefined,
    ) {
      if (!browserToken) return yield* new InvalidChallenge();

      const parsed = yield* Effect.try({
        try: () => parseSiweMessage(input.message),
        catch: () => new InvalidChallenge(),
      });
      if (
        !parsed.nonce ||
        !parsed.address ||
        !parsed.expirationTime ||
        parsed.chainId !== 11155111 ||
        parsed.domain !== new URL(config.origin).host ||
        parsed.uri !== config.origin
      ) {
        return yield* new InvalidChallenge();
      }

      const now = new Date(yield* Clock.currentTimeMillis);
      const challenge = yield* challenges.findActive(
        yield* hashToken("nonce", parsed.nonce),
        yield* hashToken("browser", browserToken),
        now,
      );

      if (challenge.message !== input.message) return yield* new InvalidChallenge();

      yield* challenges.reserveAttempt(challenge.id, now);
      yield* signatures.verify(parsed.address, input.message, input.signature);

      const issuedAt = yield* Clock.currentTimeMillis;
      const token = Encoding.encodeBase64Url(yield* crypto.randomBytes(32));
      const expiresAt = parsed.expirationTime;

      const session = {
        id: yield* crypto.randomUUIDv4,
        tokenHash: yield* hashToken("session", token),
        walletAddress: getAddress(parsed.address),
        chainId: 11155111 as const,
        createdAt: new Date(issuedAt),
        expiresAt,
      };
      const previousTokenHash = previousToken
        ? yield* hashToken("session", previousToken)
        : undefined;

      // Consume the proof, insert the session and rotate its predecessor atomically.
      yield* transactions.run(
        Effect.gen(function* () {
          yield* challenges.consume(challenge.id, session.createdAt);
          yield* sessions.create(session);
          if (previousTokenHash) yield* sessions.revoke(previousTokenHash, session.createdAt);
        }),
      );

      return {
        token,
        session: {
          address: getAddress(parsed.address),
          chainId: 11155111 as const,
          expiresAt: expiresAt.toISOString(),
        },
      };
    }),
    session: Effect.fn("Auth.session")(function* (token: string | undefined) {
      if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return yield* new Unauthenticated();

      const session = yield* sessions.findActive(
        yield* hashToken("session", token),
        new Date(yield* Clock.currentTimeMillis),
      );

      if (!session || session.chainId !== 11155111) return yield* new Unauthenticated();

      return {
        address: session.walletAddress,
        chainId: 11155111 as const,
        expiresAt: session.expiresAt.toISOString(),
      };
    }),
    logout: Effect.fn("Auth.logout")(function* (token: string | undefined) {
      if (!token) return;

      yield* sessions.revoke(
        yield* hashToken("session", token),
        new Date(yield* Clock.currentTimeMillis),
      );
    }),
  };
});

export class Auth extends Context.Service<Auth, Effect.Success<typeof make>>()("application/Auth") {
  static readonly layer = Layer.effect(Auth, make);
}
