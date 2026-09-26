import type { EmailAttempt } from "@ens-social-verification/protocol/model";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const emailAttempts = pgTable(
  "email_attempts",
  {
    id: uuid().primaryKey(),
    sessionHash: text("session_hash").notNull(),
    intent: jsonb().$type<EmailAttempt["intent"]>().notNull(),
    evidence: jsonb().$type<EmailAttempt["evidence"]>(),
    claim: jsonb().$type<EmailAttempt["claim"]>(),
    envelope: jsonb().$type<EmailAttempt["envelope"]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("email_attempts_expiry_idx").on(table.expiresAt),
    check(
      "email_attempts_ready_check",
      sql`(${table.claim} is null) = (${table.evidence} is null)`,
    ),
    check(
      "email_attempts_published_check",
      sql`${table.envelope} is null or ${table.claim} is not null`,
    ),
  ],
);
