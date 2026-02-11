import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
      isolatedDeclarations: false,
    },
  },
  external: ["ws"],
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "node22",
});
