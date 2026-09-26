import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError, EmailError } from "@ens-social-verification/protocol/errors";
import { EmailAttempt } from "@ens-social-verification/protocol/model";
import type {
  EmailEvidence,
  EmailEnvelope,
  VerificationClaim,
} from "@ens-social-verification/protocol/schema";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { emailAttempts } from "../../schema/email/attempt.js";

const make = Effect.gen(function* () {
  const database = yield* Database;
  return {
    clearExpired: Effect.fn("EmailAttemptRepository.clearExpired")(
      function* () {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .delete(emailAttempts)
          .where(
            and(
              isNull(emailAttempts.envelope),
              sql`${emailAttempts.expiresAt} < clock_timestamp()`,
            ),
          );
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    remove: Effect.fn("EmailAttemptRepository.remove")(
      function* (id: string, name: string) {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .delete(emailAttempts)
          .where(and(eq(emailAttempts.id, id), sql`${emailAttempts.intent}->>'name' = ${name}`));
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    create: Effect.fn("EmailAttemptRepository.create")(
      function* (input: EmailAttempt) {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .insert(emailAttempts)
          .values(yield* Schema.decodeUnknownEffect(EmailAttempt)(input));
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    find: Effect.fn("EmailAttemptRepository.find")(function* (id: string, sessionHash: string) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .select()
        .from(emailAttempts)
        .where(
          and(
            eq(emailAttempts.id, id),
            eq(emailAttempts.sessionHash, sessionHash),
            gt(emailAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new EmailError({
          code: "INVALID_ATTEMPT",
          message: "Verification expired. Connect Email again.",
        });
      return yield* Schema.decodeUnknownEffect(EmailAttempt)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      );
    }),
    complete: Effect.fn("EmailAttemptRepository.complete")(function* (
      id: string,
      sessionHash: string,
      evidence: EmailEvidence,
      claim: VerificationClaim,
    ) {
      const db = yield* transactionOrDatabase(database);
      const [row] = yield* db
        .update(emailAttempts)
        .set({ evidence, claim })
        .where(
          and(
            eq(emailAttempts.id, id),
            eq(emailAttempts.sessionHash, sessionHash),
            isNull(emailAttempts.claim),
            gt(emailAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning({ id: emailAttempts.id })
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row)
        return yield* new EmailError({
          code: "INVALID_ATTEMPT",
          message: "This approval was already used or expired. Connect Email again.",
        });
    }),
    publish: Effect.fn("EmailAttemptRepository.publish")(function* (
      id: string,
      sessionHash: string,
      envelope: EmailEnvelope,
    ) {
      const db = yield* transactionOrDatabase(database);
      yield* db
        .update(emailAttempts)
        .set({ envelope })
        .where(
          and(
            eq(emailAttempts.id, id),
            eq(emailAttempts.sessionHash, sessionHash),
            isNull(emailAttempts.envelope),
            gt(emailAttempts.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .pipe(Effect.mapError(() => new DatabaseError()));
      const [row] = yield* db
        .select()
        .from(emailAttempts)
        .where(and(eq(emailAttempts.id, id), eq(emailAttempts.sessionHash, sessionHash)))
        .pipe(Effect.mapError(() => new DatabaseError()));
      const stored = row
        ? yield* Schema.decodeUnknownEffect(EmailAttempt)(row).pipe(
            Effect.mapError(() => new DatabaseError()),
          )
        : null;
      if (!stored?.envelope)
        return yield* new EmailError({
          code: "INVALID_ATTEMPT",
          message: "Publication expired. Connect Email again.",
        });
      return stored.envelope;
    }),
    proof: Effect.fn("EmailAttemptRepository.proof")(
      function* (id: string) {
        const db = yield* transactionOrDatabase(database);
        const [row] = yield* db.select().from(emailAttempts).where(eq(emailAttempts.id, id));
        return row ? (yield* Schema.decodeUnknownEffect(EmailAttempt)(row)).envelope : null;
      },
      Effect.mapError(() => new DatabaseError()),
    ),
  };
});

export class EmailAttemptRepository extends Context.Service<
  EmailAttemptRepository,
  Effect.Success<typeof make>
>()("database/EmailAttemptRepository") {
  static readonly layer = Layer.effect(EmailAttemptRepository, make);
}
