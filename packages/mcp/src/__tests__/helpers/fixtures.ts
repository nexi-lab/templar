/**
 * Canned fixtures for MCP tests.
 */

export const VALID_STDIO_CONFIG = {
  transport: "stdio",
  command: "node",
  args: ["server.js"],
  env: { FOO: "bar" },
  cwd: "/tmp",
} as const;

export const VALID_HTTP_CONFIG = {
  transport: "http",
  url: "https://mcp.example.com/v1",
  headers: { Authorization: "Bearer token123" },
} as const;

export const MINIMAL_STDIO_CONFIG = {
  transport: "stdio",
  command: "echo",
} as const;

export const MINIMAL_HTTP_CONFIG = {
  transport: "http",
  url: "https://mcp.example.com",
} as const;

export const SAMPLE_TOOL = {
  name: "get_weather",
  description: "Get weather for a location",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
} as const;

export const SAMPLE_RESOURCE = {
  name: "readme",
  uri: "file:///README.md",
  description: "Project README",
  mimeType: "text/markdown",
} as const;

export const SAMPLE_PROMPT = {
  name: "summarize",
  description: "Summarize text",
  arguments: [{ name: "text", description: "The text to summarize", required: true }],
} as const;

export const SAMPLE_TOOL_RESULT = {
  content: [{ type: "text" as const, text: "Sunny, 72F" }],
} as const;

export const SAMPLE_RESOURCE_CONTENT = {
  uri: "file:///README.md",
  contents: [{ type: "text" as const, text: "# Hello World" }],
} as const;
