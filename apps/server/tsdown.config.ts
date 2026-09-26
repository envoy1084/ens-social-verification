import defineConfig from "klarity/tsdown/node";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: false,
  exports: false,
  publint: false,
  target: "node24",
  unbundle: true,
});
