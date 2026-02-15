import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    memory: "src/memory/index.ts",
    pay: "src/pay/index.ts",
    audit: "src/audit/index.ts",
    permissions: "src/permissions/index.ts",
    identity: "src/identity/index.ts",
    utils: "src/utils.ts",
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
