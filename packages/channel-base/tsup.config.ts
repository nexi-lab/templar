import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/testing.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  external: ["@templar/core", "@templar/errors"],
  clean: true,
  treeshake: true,
  target: "node22",
});
