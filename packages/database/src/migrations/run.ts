import { Effect } from "effect";

import { DatabaseConfig } from "../config.js";
import { runDatabaseMigrations } from "./layer.js";

if (process.env.AUTH_INTEGRATION === "1") {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must point to a dedicated database ending in _test");
  }

  process.env.DATABASE_URL = url;
}

await Effect.runPromise(runDatabaseMigrations().pipe(Effect.provide(DatabaseConfig.layer)));
