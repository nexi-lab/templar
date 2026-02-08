import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false, // Temporarily disabled - will fix with proper TypeScript project references
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "node22",
});
