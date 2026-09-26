import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
