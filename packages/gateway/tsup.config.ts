import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/sessions/index.ts", "src/routing/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  treeshake: true,
  target: "node22",
});
