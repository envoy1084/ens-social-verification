import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError, OAuthError } from "@ens-social-verification/protocol/errors";
import { OAuthAttempt } from "@ens-social-verification/protocol/model";
import { and, eq, gt, sql } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { oauthAttempts } from "../../schema/oauth/attempt.js";

const make = Effect.gen(function* () {
  const database = yield* Database;
  return {
    create: Effect.fn("OAuthAttemptRepository.create")(
      function* (input: OAuthAttempt) {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .insert(oauthAttempts)
          .values(yield* Schema.decodeUnknownEffect(OAuthAttempt)(input));
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    find: Effect.fn("OAuthAttemptRepository.find")(function* (id: string, sessionHash: string) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .select()
        .from(oauthAttempts)
        .where(
          and(
            eq(oauthAttempts.id, id),
            eq(oauthAttempts.sessionHash, sessionHash),
            gt(oauthAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new OAuthError({
          code: "INVALID_ATTEMPT",
          message: "Verification expired. Connect your account again.",
        });
      return yield* Schema.decodeUnknownEffect(OAuthAttempt)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      );
    }),
    consume: Effect.fn("OAuthAttemptRepository.consume")(function* (
      provider: string,
      stateHash: string,
      sessionHash: string,
      pkceChallenge: string,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(oauthAttempts)
        .set({ status: "processing" })
        .where(
          and(
            eq(oauthAttempts.provider, provider),
            eq(oauthAttempts.stateHash, stateHash),
            eq(oauthAttempts.sessionHash, sessionHash),
            eq(oauthAttempts.pkceChallenge, pkceChallenge),
            eq(oauthAttempts.status, "pending"),
            gt(oauthAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning()
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new OAuthError({
          code: "INVALID_ATTEMPT",
          message: "Invalid, expired, or already used OAuth callback.",
        });
      return yield* Schema.decodeUnknownEffect(OAuthAttempt)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      );
    }),
    complete: Effect.fn("OAuthAttemptRepository.complete")(function* (
      id: string,
      identity: NonNullable<OAuthAttempt["identity"]>,
      claim: NonNullable<OAuthAttempt["claim"]>,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(oauthAttempts)
        .set({ status: "ready", identity, claim })
        .where(
          and(
            eq(oauthAttempts.id, id),
            eq(oauthAttempts.status, "processing"),
            gt(oauthAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning({ id: oauthAttempts.id })
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new OAuthError({
          code: "INVALID_ATTEMPT",
          message: "Verification expired. Connect your account again.",
        });
    }),
    clearExpired: Effect.fn("OAuthAttemptRepository.clearExpired")(
      function* () {
        const db = yield* transactionOrDatabase(database);
        yield* db.delete(oauthAttempts).where(sql`${oauthAttempts.expiresAt} <= clock_timestamp()`);
      },
      Effect.mapError(() => new DatabaseError()),
    ),
  };
});

export class OAuthAttemptRepository extends Context.Service<
  OAuthAttemptRepository,
  Effect.Success<typeof make>
>()("database/OAuthAttemptRepository") {
  static readonly layer = Layer.effect(OAuthAttemptRepository, make);
}
