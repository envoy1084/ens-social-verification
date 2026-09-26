import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid().primaryKey(),
    nonceHash: text("nonce_hash").notNull().unique(),
    browserTokenHash: text("browser_token_hash").notNull(),
    message: text(),
    attempts: integer().notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [index("auth_challenges_expiry_idx").on(table.expiresAt)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    walletAddress: text("wallet_address").notNull(),
    chainId: integer("chain_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("sessions_expiry_idx").on(table.expiresAt)],
);
