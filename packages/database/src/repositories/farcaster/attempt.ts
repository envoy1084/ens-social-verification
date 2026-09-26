import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError, FarcasterError } from "@ens-social-verification/protocol/errors";
import { FarcasterAttempt } from "@ens-social-verification/protocol/model";
import type {
  FarcasterEvidence,
  FarcasterEnvelope,
  VerificationClaim,
} from "@ens-social-verification/protocol/schema";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { farcasterAttempts } from "../../schema/farcaster/attempt.js";

const make = Effect.gen(function* () {
  const database = yield* Database;
  return {
    remove: Effect.fn("FarcasterAttemptRepository.remove")(
      function* (id: string, name: string) {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .delete(farcasterAttempts)
          .where(
            and(eq(farcasterAttempts.id, id), sql`${farcasterAttempts.intent}->>'name' = ${name}`),
          );
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    create: Effect.fn("FarcasterAttemptRepository.create")(
      function* (input: FarcasterAttempt) {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .insert(farcasterAttempts)
          .values(yield* Schema.decodeUnknownEffect(FarcasterAttempt)(input));
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    find: Effect.fn("FarcasterAttemptRepository.find")(function* (id: string, sessionHash: string) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .select()
        .from(farcasterAttempts)
        .where(
          and(
            eq(farcasterAttempts.id, id),
            eq(farcasterAttempts.sessionHash, sessionHash),
            gt(farcasterAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new FarcasterError({
          code: "INVALID_ATTEMPT",
          message: "Verification expired. Connect Farcaster again.",
        });
      return yield* Schema.decodeUnknownEffect(FarcasterAttempt)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      );
    }),
    complete: Effect.fn("FarcasterAttemptRepository.complete")(function* (
      id: string,
      sessionHash: string,
      evidence: FarcasterEvidence,
      claim: VerificationClaim,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(farcasterAttempts)
        .set({ evidence, claim })
        .where(
          and(
            eq(farcasterAttempts.id, id),
            eq(farcasterAttempts.sessionHash, sessionHash),
            isNull(farcasterAttempts.claim),
            gt(farcasterAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning({ id: farcasterAttempts.id })
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new FarcasterError({
          code: "INVALID_ATTEMPT",
          message: "This approval was already used or expired. Connect Farcaster again.",
        });
    }),
    publish: Effect.fn("FarcasterAttemptRepository.publish")(function* (
      id: string,
      sessionHash: string,
      envelope: FarcasterEnvelope,
    ) {
      const db = yield* transactionOrDatabase(database);
      yield* db
        .update(farcasterAttempts)
        .set({ envelope })
        .where(
          and(
            eq(farcasterAttempts.id, id),
            eq(farcasterAttempts.sessionHash, sessionHash),
            isNull(farcasterAttempts.envelope),
            gt(farcasterAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .pipe(Effect.mapError(() => new DatabaseError()));
      const [row] = yield* db
        .select()
        .from(farcasterAttempts)
        .where(and(eq(farcasterAttempts.id, id), eq(farcasterAttempts.sessionHash, sessionHash)))
        .pipe(Effect.mapError(() => new DatabaseError()));
      const stored = row
        ? yield* Schema.decodeUnknownEffect(FarcasterAttempt)(row).pipe(
            Effect.mapError(() => new DatabaseError()),
          )
        : null;
      if (!stored?.envelope)
        return yield* new FarcasterError({
          code: "INVALID_ATTEMPT",
          message: "Publication expired. Connect Farcaster again.",
        });
      return stored.envelope;
    }),
    proof: Effect.fn("FarcasterAttemptRepository.proof")(
      function* (id: string) {
        const db = yield* transactionOrDatabase(database);
        const [row] = yield* db
          .select()
          .from(farcasterAttempts)
          .where(eq(farcasterAttempts.id, id));
        return row ? (yield* Schema.decodeUnknownEffect(FarcasterAttempt)(row)).envelope : null;
      },
      Effect.mapError(() => new DatabaseError()),
    ),
  };
});

export class FarcasterAttemptRepository extends Context.Service<
  FarcasterAttemptRepository,
  Effect.Success<typeof make>
>()("database/FarcasterAttemptRepository") {
  static readonly layer = Layer.effect(FarcasterAttemptRepository, make);
}
