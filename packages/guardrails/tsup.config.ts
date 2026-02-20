import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    evidence: "src/evidence/index.ts",
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
