import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

if (existsSync("../../apps/server/.env")) process.loadEnvFile("../../apps/server/.env");

const url =
  (process.env.AUTH_INTEGRATION === "1"
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL) ?? "";

if (process.env.AUTH_INTEGRATION === "1" && (!url || !new URL(url).pathname.endsWith("_test"))) {
  throw new Error("TEST_DATABASE_URL must point to a dedicated database ending in _test");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url },
  strict: true,
});
