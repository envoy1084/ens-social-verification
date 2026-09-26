import config from "klarity/oxlint/react";
import { defineConfig } from "oxlint";
export default defineConfig({ extends: [config], ignorePatterns: ["src/routeTree.gen.ts"] });
