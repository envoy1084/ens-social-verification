import defineConfig from "klarity/vitest/node";

export default defineConfig({
  resolve: { conditions: ["workspace-source"] },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
