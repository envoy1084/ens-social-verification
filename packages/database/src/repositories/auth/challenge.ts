import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError, InvalidChallenge } from "@ens-social-verification/protocol/errors";
import { AuthChallenge, AuthChallengeInsert } from "@ens-social-verification/protocol/model";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { authChallenges } from "../../schema/auth/challenge.js";

const make = Effect.gen(function* () {
  const database = yield* Database;

  return {
    create: Effect.fn("ChallengeRepository.create")(
      function* (challenge: AuthChallengeInsert) {
        const db = yield* transactionOrDatabase(database);
        const input = yield* Schema.decodeUnknownEffect(AuthChallengeInsert)(challenge);

        yield* db.insert(authChallenges).values(input);
      },
      Effect.mapError(() => new DatabaseError()),
    ),

    findActive: Effect.fn("ChallengeRepository.findActive")(function* (
      nonceHash: string,
      browserTokenHash: string,
      now: Date,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .select()
        .from(authChallenges)
        .where(
          and(
            eq(authChallenges.nonceHash, nonceHash),
            eq(authChallenges.browserTokenHash, browserTokenHash),
            isNull(authChallenges.consumedAt),
            gt(authChallenges.expiresAt, now),
            lt(authChallenges.attempts, 5),
          ),
        )
        .pipe(Effect.mapError(() => new DatabaseError()));

      if (!row) return yield* new InvalidChallenge();

      return yield* Schema.decodeUnknownEffect(AuthChallenge)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      );
    }),

    prepareMessage: Effect.fn("ChallengeRepository.prepareMessage")(function* (
      id: string,
      message: string,
      now: Date,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(authChallenges)
        .set({ message })
        .where(
          and(
            eq(authChallenges.id, id),
            or(isNull(authChallenges.message), eq(authChallenges.message, message)),
            isNull(authChallenges.consumedAt),
            gt(authChallenges.expiresAt, now),
          ),
        )
        .returning({ id: authChallenges.id })
        .pipe(Effect.mapError(() => new DatabaseError()));

      if (!row) return yield* new InvalidChallenge();
    }),

    reserveAttempt: Effect.fn("ChallengeRepository.reserveAttempt")(function* (
      id: string,
      now: Date,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(authChallenges)
        .set({ attempts: sql`${authChallenges.attempts} + 1` })
        .where(
          and(
            eq(authChallenges.id, id),
            isNull(authChallenges.consumedAt),
            gt(authChallenges.expiresAt, now),
            lt(authChallenges.attempts, 5),
          ),
        )
        .returning({ id: authChallenges.id })
        .pipe(Effect.mapError(() => new DatabaseError()));

      if (!row) return yield* new InvalidChallenge();
    }),

    consume: Effect.fn("ChallengeRepository.consume")(function* (id: string, now: Date) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(authChallenges)
        .set({ consumedAt: now })
        .where(
          and(
            eq(authChallenges.id, id),
            isNull(authChallenges.consumedAt),
            gt(authChallenges.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning({ id: authChallenges.id })
        .pipe(Effect.mapError(() => new DatabaseError()));

      if (!row) return yield* new InvalidChallenge();
    }),
  };
});

export class ChallengeRepository extends Context.Service<
  ChallengeRepository,
  Effect.Success<typeof make>
>()("database/ChallengeRepository") {
  static readonly layer = Layer.effect(ChallengeRepository, make);
}
