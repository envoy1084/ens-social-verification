import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError, OAuthError } from "@ens-social-verification/protocol/errors";
import { OAuthAttestation } from "@ens-social-verification/protocol/model";
import type { OAuthEnvelope } from "@ens-social-verification/protocol/schema";
import { and, eq, gt, sql } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { oauthAttempts } from "../../schema/oauth/attempt.js";
import { oauthAttestations } from "../../schema/oauth/attestation.js";

const make = Effect.gen(function* () {
  const database = yield* Database;
  return {
    find: Effect.fn("OAuthAttestationRepository.find")(
      function* (id: string) {
        const db = yield* transactionOrDatabase(database);
        const [row] = yield* db
          .select()
          .from(oauthAttestations)
          .where(eq(oauthAttestations.id, id));
        return row ? yield* Schema.decodeUnknownEffect(OAuthAttestation)(row) : null;
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    publish: Effect.fn("OAuthAttestationRepository.publish")(function* (
      id: string,
      sessionHash: string,
      envelope: OAuthEnvelope,
    ) {
      const db = yield* transactionOrDatabase(database);
      // INSERT SELECT checks expiry at insertion; the primary key makes concurrent publication idempotent.
      yield* db
        .insert(oauthAttestations)
        .select(
          db
            .select({
              id: oauthAttempts.id,
              envelope: sql<OAuthEnvelope>`${JSON.stringify(envelope)}::jsonb`.as("envelope"),
              createdAt: sql<Date>`clock_timestamp()`.as("created_at"),
              revokedAt: sql<Date | null>`null::timestamptz`.as("revoked_at"),
            })
            .from(oauthAttempts)
            .where(
              and(
                eq(oauthAttempts.id, id),
                eq(oauthAttempts.sessionHash, sessionHash),
                eq(oauthAttempts.status, "ready"),
                gt(oauthAttempts.expiresAt, sql`clock_timestamp()`),
              ),
            ),
        )
        .onConflictDoNothing()
        .pipe(Effect.mapError(() => new DatabaseError()));
      const [row] = yield* db
        .select()
        .from(oauthAttestations)
        .where(eq(oauthAttestations.id, id))
        .pipe(Effect.mapError(() => new DatabaseError()));
      if (!row || row.revokedAt)
        return yield* new OAuthError({
          code: "INVALID_ATTEMPT",
          message: "Publication expired or was revoked. Connect again.",
        });
      return (yield* Schema.decodeUnknownEffect(OAuthAttestation)(row).pipe(
        Effect.mapError(() => new DatabaseError()),
      )).envelope;
    }),
    revoke: Effect.fn("OAuthAttestationRepository.revoke")(
      function* (id: string) {
        const db = yield* transactionOrDatabase(database);
        yield* db
          .update(oauthAttestations)
          .set({ revokedAt: sql`coalesce(${oauthAttestations.revokedAt}, clock_timestamp())` })
          .where(eq(oauthAttestations.id, id));
      },
      Effect.mapError(() => new DatabaseError()),
    ),
  };
});

export class OAuthAttestationRepository extends Context.Service<
  OAuthAttestationRepository,
  Effect.Success<typeof make>
>()("database/OAuthAttestationRepository") {
  static readonly layer = Layer.effect(OAuthAttestationRepository, make);
}
