import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "resources/agents": "src/resources/agents.ts",
    "resources/tools": "src/resources/tools.ts",
    "resources/channels": "src/resources/channels.ts",
    "resources/memory": "src/resources/memory.ts",
    "http/index": "src/http/index.ts",
  },
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  clean: true,
  treeshake: true,
  splitting: true,
  target: "node18",
});
