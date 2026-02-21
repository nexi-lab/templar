import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "zone/index": "src/zone/index.ts",
    "sync/index": "src/sync/index.ts",
    "vector-clock/index": "src/vector-clock/index.ts",
    "conflict/index": "src/conflict/index.ts",
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
