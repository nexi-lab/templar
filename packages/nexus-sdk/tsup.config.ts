import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "resources/agents": "src/resources/agents.ts",
    "resources/tools": "src/resources/tools.ts",
    "resources/channels": "src/resources/channels.ts",
    "resources/memory": "src/resources/memory.ts",
    "resources/eventlog": "src/resources/eventlog.ts",
    "resources/permissions": "src/resources/permissions.ts",
    "resources/sandbox": "src/resources/sandbox.ts",
    "resources/secrets-audit": "src/resources/secrets-audit.ts",
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
