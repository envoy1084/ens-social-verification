import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError, XError } from "@ens-social-verification/protocol/errors";
import { XAttempt } from "@ens-social-verification/protocol/model";
import { and, eq, gt, sql } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { xAttempts } from "../../schema/x/attempt.js";

const make = Effect.gen(function* () {
  const database = yield* Database;

  return {
    create: Effect.fn("XAttemptRepository.create")(
      function* (input: XAttempt) {
        const db = yield* transactionOrDatabase(database);
        const attempt = yield* Schema.decodeUnknownEffect(XAttempt)(input);
        yield* db.insert(xAttempts).values(attempt);
      },
      Effect.mapError(() => new DatabaseError()),
    ),

    find: Effect.fn("XAttemptRepository.find")(function* (id: string, sessionHash: string) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .select()
        .from(xAttempts)
        .where(
          and(
            eq(xAttempts.id, id),
            eq(xAttempts.sessionHash, sessionHash),
            gt(xAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new XError({
          code: "INVALID_ATTEMPT",
          message: "Verification expired. Connect X again.",
        });
      return yield* Schema.decodeUnknownEffect(XAttempt)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      );
    }),

    consume: Effect.fn("XAttemptRepository.consume")(function* (
      stateHash: string,
      sessionHash: string,
      pkceChallenge: string,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(xAttempts)
        .set({ status: "processing" })
        .where(
          and(
            eq(xAttempts.stateHash, stateHash),
            eq(xAttempts.sessionHash, sessionHash),
            eq(xAttempts.pkceChallenge, pkceChallenge),
            eq(xAttempts.status, "pending"),
            gt(xAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning()
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new XError({
          code: "INVALID_ATTEMPT",
          message: "Invalid or already used X callback",
        });
      return yield* Schema.decodeUnknownEffect(XAttempt)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      );
    }),

    complete: Effect.fn("XAttemptRepository.complete")(function* (
      id: string,
      identity: NonNullable<XAttempt["identity"]>,
      claim: NonNullable<XAttempt["claim"]>,
      encryptedToken: string,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(xAttempts)
        .set({ status: "ready", identity, claim, encryptedToken })
        .where(
          and(
            eq(xAttempts.id, id),
            eq(xAttempts.status, "processing"),
            gt(xAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning({ id: xAttempts.id })
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new XError({
          code: "INVALID_ATTEMPT",
          message: "Verification expired. Connect X again.",
        });
    }),
    claimPublication: Effect.fn("XAttemptRepository.claimPublication")(function* (id: string) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(xAttempts)
        .set({ status: "publishing" })
        .where(
          and(
            eq(xAttempts.id, id),
            eq(xAttempts.status, "ready"),
            gt(xAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning({ id: xAttempts.id })
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new XError({
          code: "INVALID_ATTEMPT",
          message:
            "Publication is already running or has expired. Check the profile before trying again.",
        });
    }),
    clearToken: Effect.fn("XAttemptRepository.clearToken")(
      function* (id: string) {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .update(xAttempts)
          .set({ encryptedToken: null, status: "publishing" })
          .where(eq(xAttempts.id, id));
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    clearExpiredTokens: Effect.fn("XAttemptRepository.clearExpiredTokens")(
      function* () {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .update(xAttempts)
          .set({ encryptedToken: null, status: "publishing" })
          .where(
            sql`${xAttempts.expiresAt} <= clock_timestamp() and ${xAttempts.encryptedToken} is not null`,
          );
      },
      Effect.mapError(() => new DatabaseError()),
    ),
  };
});

export class XAttemptRepository extends Context.Service<
  XAttemptRepository,
  Effect.Success<typeof make>
>()("database/XAttemptRepository") {
  static readonly layer = Layer.effect(XAttemptRepository, make);
}
