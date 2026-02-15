import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/sessions/index.ts", "src/protocol/index.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
      isolatedDeclarations: false,
    },
  },
  external: ["ws", "chokidar"],
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "node22",
});
