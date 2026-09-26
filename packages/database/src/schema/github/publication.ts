import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { githubAttempts } from "./attempt.js";

export const githubPublications = pgTable("github_publications", {
  id: uuid()
    .primaryKey()
    .references(() => githubAttempts.id, { onDelete: "restrict" }),
  name: text().notNull(),
  login: text().notNull(),
  gistId: text("gist_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
