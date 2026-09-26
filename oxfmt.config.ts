import config from "klarity/oxfmt";
import { defineConfig } from "oxfmt";

export default defineConfig({
  ...config,
  ignorePatterns: [...(config.ignorePatterns ?? []), "**/routeTree.gen.ts"],
});
