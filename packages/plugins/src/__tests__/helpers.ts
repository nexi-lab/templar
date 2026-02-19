import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginCapability, TemplarPluginApi, TemplarPluginDefinition } from "@templar/core";

/**
 * Create a mock plugin definition with sensible defaults.
 */
export function createMockPlugin(
  overrides: Partial<TemplarPluginDefinition> = {},
): TemplarPluginDefinition {
  return {
    name: overrides.name ?? "mock-plugin",
    version: overrides.version ?? "1.0.0",
    capabilities: overrides.capabilities ?? ["tools"],
    register: overrides.register ?? (async (_api: TemplarPluginApi) => {}),
    ...(overrides.teardown ? { teardown: overrides.teardown } : {}),
  };
}

/**
 * Create a mock plugin that registers a tool when register() is called.
 */
export function createToolPlugin(
  name: string,
  toolName: string,
  capabilities: PluginCapability[] = ["tools"],
): TemplarPluginDefinition {
  return createMockPlugin({
    name,
    capabilities,
    register: async (api: TemplarPluginApi) => {
      api.registerTool({ name: toolName, description: `Tool from ${name}` });
    },
  });
}

/**
 * Create a mock plugin that registers middleware.
 */
export function createMiddlewarePlugin(name: string): TemplarPluginDefinition {
  return createMockPlugin({
    name,
    capabilities: ["middleware"],
    register: async (api: TemplarPluginApi) => {
      api.registerMiddleware({ name: `${name}-mw` });
    },
  });
}

/**
 * Write a real ESM plugin file to a temp directory for integration tests.
 */
export async function writeTempPlugin(
  dir: string,
  pluginName: string,
  content?: string,
): Promise<string> {
  const pluginDir = join(dir, pluginName);
  await mkdir(pluginDir, { recursive: true });

  const code =
    content ??
    `
export default {
  name: "${pluginName}",
  version: "1.0.0",
  capabilities: ["tools"],
  register: async (api) => {
    api.registerTool({ name: "${pluginName}-tool", description: "A test tool" });
  },
};
`.trim();

  const filePath = join(pluginDir, "index.js");
  await writeFile(filePath, code, "utf-8");
  return pluginDir;
}
