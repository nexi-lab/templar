import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    memory: "src/memory/index.ts",
    pay: "src/pay/index.ts",
    audit: "src/audit/index.ts",
    permissions: "src/permissions/index.ts",
  },
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  clean: true,
  treeshake: true,
  target: "node22",
});
