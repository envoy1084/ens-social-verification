import type { OAuthAttempt } from "@ens-social-verification/protocol/model";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const oauthAttempts = pgTable(
  "oauth_attempts",
  {
    id: uuid().primaryKey(),
    provider: text().notNull(),
    name: text().notNull(),
    walletAddress: text("wallet_address").notNull(),
    sessionHash: text("session_hash").notNull(),
    stateHash: text("state_hash").notNull().unique(),
    pkceChallenge: text("pkce_challenge").notNull(),
    status: text().$type<OAuthAttempt["status"]>().notNull(),
    identity: jsonb().$type<OAuthAttempt["identity"]>(),
    claim: jsonb().$type<OAuthAttempt["claim"]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("oauth_attempts_expiry_idx").on(table.expiresAt),
    check(
      "oauth_attempts_status_check",
      sql`${table.status} in ('pending', 'processing', 'ready')`,
    ),
    check(
      "oauth_attempts_ready_check",
      sql`${table.status} != 'ready' or (${table.identity} is not null and ${table.claim} is not null)`,
    ),
  ],
);
