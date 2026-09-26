import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError, GithubError } from "@ens-social-verification/protocol/errors";
import { GithubAttempt } from "@ens-social-verification/protocol/model";
import { and, eq, gt, sql } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { githubAttempts } from "../../schema/github/attempt.js";

const make = Effect.gen(function* () {
  const database = yield* Database;

  return {
    create: Effect.fn("GithubAttemptRepository.create")(
      function* (input: GithubAttempt) {
        const db = yield* transactionOrDatabase(database);
        const attempt = yield* Schema.decodeUnknownEffect(GithubAttempt)(input);
        yield* db.insert(githubAttempts).values(attempt);
      },
      Effect.mapError(() => new DatabaseError()),
    ),

    find: Effect.fn("GithubAttemptRepository.find")(function* (id: string, sessionHash: string) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .select()
        .from(githubAttempts)
        .where(
          and(
            eq(githubAttempts.id, id),
            eq(githubAttempts.sessionHash, sessionHash),
            gt(githubAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new GithubError({
          code: "INVALID_ATTEMPT",
          message: "Verification expired. Connect GitHub again.",
        });
      return yield* Schema.decodeUnknownEffect(GithubAttempt)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      );
    }),

    consume: Effect.fn("GithubAttemptRepository.consume")(function* (
      stateHash: string,
      sessionHash: string,
      pkceChallenge: string,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(githubAttempts)
        .set({ status: "processing" })
        .where(
          and(
            eq(githubAttempts.stateHash, stateHash),
            eq(githubAttempts.sessionHash, sessionHash),
            eq(githubAttempts.pkceChallenge, pkceChallenge),
            eq(githubAttempts.status, "pending"),
            gt(githubAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning()
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new GithubError({
          code: "INVALID_ATTEMPT",
          message: "Invalid or already used GitHub callback",
        });
      return yield* Schema.decodeUnknownEffect(GithubAttempt)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      );
    }),

    complete: Effect.fn("GithubAttemptRepository.complete")(function* (
      id: string,
      identity: NonNullable<GithubAttempt["identity"]>,
      claim: NonNullable<GithubAttempt["claim"]>,
      encryptedToken: string,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(githubAttempts)
        .set({ status: "ready", identity, claim, encryptedToken })
        .where(
          and(
            eq(githubAttempts.id, id),
            eq(githubAttempts.status, "processing"),
            gt(githubAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning({ id: githubAttempts.id })
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new GithubError({
          code: "INVALID_ATTEMPT",
          message: "Verification expired. Connect GitHub again.",
        });
    }),
    claimPublication: Effect.fn("GithubAttemptRepository.claimPublication")(function* (id: string) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(githubAttempts)
        .set({ status: "publishing", encryptedToken: null })
        .where(
          and(
            eq(githubAttempts.id, id),
            eq(githubAttempts.status, "ready"),
            gt(githubAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning({ id: githubAttempts.id })
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new GithubError({
          code: "INVALID_ATTEMPT",
          message:
            "Publication is already running or has expired. Check the profile before trying again.",
        });
    }),
    clearExpiredTokens: Effect.fn("GithubAttemptRepository.clearExpiredTokens")(
      function* () {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .update(githubAttempts)
          .set({ encryptedToken: null, status: "publishing" })
          .where(
            sql`${githubAttempts.expiresAt} <= clock_timestamp() and ${githubAttempts.encryptedToken} is not null`,
          );
      },
      Effect.mapError(() => new DatabaseError()),
    ),
  };
});

export class GithubAttemptRepository extends Context.Service<
  GithubAttemptRepository,
  Effect.Success<typeof make>
>()("database/GithubAttemptRepository") {
  static readonly layer = Layer.effect(GithubAttemptRepository, make);
}
