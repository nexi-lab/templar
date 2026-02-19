import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    middleware: "src/middleware.ts",
    "providers/index": "src/providers/index.ts",
  },
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
      isolatedDeclarations: false,
    },
  },
  clean: true,
  treeshake: true,
  target: "node22",
});
