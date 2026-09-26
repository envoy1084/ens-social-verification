import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError } from "@ens-social-verification/protocol/errors";
import { Session, SessionInsert } from "@ens-social-verification/protocol/model";
import { and, eq, gt, isNull } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { sessions } from "../../schema/auth/session.js";

const make = Effect.gen(function* () {
  const database = yield* Database;

  return {
    create: Effect.fn("SessionRepository.create")(
      function* (session: SessionInsert) {
        const db = yield* transactionOrDatabase(database);
        const input = yield* Schema.decodeUnknownEffect(SessionInsert)(session);

        yield* db.insert(sessions).values(input);
      },
      Effect.mapError(() => new DatabaseError()),
    ),

    findActive: Effect.fn("SessionRepository.findActive")(
      function* (tokenHash: string, now: Date) {
        const db = yield* transactionOrDatabase(database);
        const [row] = yield* db
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.tokenHash, tokenHash),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, now),
            ),
          );

        return row ? yield* Schema.decodeUnknownEffect(Session)(row) : undefined;
      },
      Effect.mapError(() => new DatabaseError()),
    ),

    revoke: Effect.fn("SessionRepository.revoke")(
      function* (tokenHash: string, now: Date) {
        const db = yield* transactionOrDatabase(database);

        yield* db
          .update(sessions)
          .set({ revokedAt: now })
          .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
      },
      Effect.mapError(() => new DatabaseError()),
    ),
  };
});

export class SessionRepository extends Context.Service<
  SessionRepository,
  Effect.Success<typeof make>
>()("database/SessionRepository") {
  static readonly layer = Layer.effect(SessionRepository, make);
}
