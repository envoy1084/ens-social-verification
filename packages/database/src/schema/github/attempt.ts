import type { GithubAttempt } from "@ens-social-verification/protocol/model";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const githubAttempts = pgTable(
  "github_attempts",
  {
    id: uuid().primaryKey(),
    name: text().notNull(),
    walletAddress: text("wallet_address").notNull(),
    sessionHash: text("session_hash").notNull(),
    stateHash: text("state_hash").notNull().unique(),
    pkceChallenge: text("pkce_challenge").notNull(),
    status: text().$type<GithubAttempt["status"]>().notNull(),
    encryptedToken: text("encrypted_token"),
    identity: jsonb().$type<GithubAttempt["identity"]>(),
    claim: jsonb().$type<GithubAttempt["claim"]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("github_attempts_expiry_idx").on(table.expiresAt),
    check(
      "github_attempts_status_check",
      sql`${table.status} in ('pending', 'processing', 'ready', 'publishing')`,
    ),
    check(
      "github_attempts_ready_check",
      sql`${table.status} != 'ready' or (${table.identity} is not null and ${table.claim} is not null and ${table.encryptedToken} is not null)`,
    ),
  ],
);
