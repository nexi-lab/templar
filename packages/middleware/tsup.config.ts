import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/memory.ts", "src/pay.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  treeshake: true,
  target: "node22",
});
