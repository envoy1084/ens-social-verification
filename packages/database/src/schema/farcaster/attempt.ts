import type { FarcasterAttempt } from "@ens-social-verification/protocol/model";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const farcasterAttempts = pgTable(
  "farcaster_attempts",
  {
    id: uuid().primaryKey(),
    sessionHash: text("session_hash").notNull(),
    intent: jsonb().$type<FarcasterAttempt["intent"]>().notNull(),
    evidence: jsonb().$type<FarcasterAttempt["evidence"]>(),
    claim: jsonb().$type<FarcasterAttempt["claim"]>(),
    envelope: jsonb().$type<FarcasterAttempt["envelope"]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("farcaster_attempts_expiry_idx").on(table.expiresAt),
    check(
      "farcaster_attempts_ready_check",
      sql`(${table.claim} is null) = (${table.evidence} is null)`,
    ),
    check(
      "farcaster_attempts_published_check",
      sql`${table.envelope} is null or ${table.claim} is not null`,
    ),
  ],
);
