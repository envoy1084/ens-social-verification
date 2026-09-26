import type { OAuthEnvelope } from "@ens-social-verification/protocol/schema";
import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

export const oauthAttestations = pgTable("oauth_attestations", {
  // Same ID as the attempt, without a foreign key so expired private attempts can be deleted.
  id: uuid().primaryKey(),
  envelope: jsonb().$type<OAuthEnvelope>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
