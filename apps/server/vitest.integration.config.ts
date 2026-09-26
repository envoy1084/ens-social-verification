import { existsSync } from "node:fs";

import defineConfig from "klarity/vitest/node";

if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: { conditions: ["workspace-source"] },
  test: { include: ["tests/integration/**/*.test.ts"] },
});
