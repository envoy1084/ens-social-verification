import { spawnSync } from "node:child_process";

process.loadEnvFile("apps/server/.env");

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !databaseUrl.password) {
  throw new Error("DATABASE_URL must be a PostgreSQL URL with a password");
}

const result = spawnSync("docker", ["compose", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    POSTGRES_USER: decodeURIComponent(databaseUrl.username),
    POSTGRES_PASSWORD: decodeURIComponent(databaseUrl.password),
    POSTGRES_DB: decodeURIComponent(databaseUrl.pathname.slice(1)),
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
