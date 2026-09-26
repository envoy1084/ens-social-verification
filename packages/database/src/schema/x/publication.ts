import type { XEnvelope } from "@ens-social-verification/protocol/schema";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { xAttempts } from "./attempt.js";

export const xPublications = pgTable("x_publications", {
  id: uuid()
    .primaryKey()
    .references(() => xAttempts.id, { onDelete: "restrict" }),
  name: text().notNull(),
  login: text().notNull(),
  postId: text("post_id").notNull().unique(),
  envelope: jsonb().$type<XEnvelope>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
