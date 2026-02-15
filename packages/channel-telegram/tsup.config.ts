import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  external: ["@templar/core", "@templar/errors", "@templar/channel-base"],
  clean: true,
  treeshake: true,
  target: "node22",
});
