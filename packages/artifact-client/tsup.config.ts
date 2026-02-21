import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    tools: "src/tools/index.ts",
    middleware: "src/middleware/index.ts",
  },
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "node22",
});
