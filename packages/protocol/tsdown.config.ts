import defineConfig from "klarity/tsdown/library";
import type { UserConfig } from "tsdown";
export default defineConfig({
  entry: [
    "src/index.ts",
    "src/schema/index.ts",
    "src/model/index.ts",
    "src/dto/index.ts",
    "src/errors/index.ts",
  ],
  dts: false,
  exports: false,
  publint: false,
  unbundle: true,
}) as UserConfig;
