/**
 * Readonly, frozen return types for MCP primitives.
 * All types are fully immutable — consumers never get mutable references.
 *
 * Note: Optional properties use `| undefined` to satisfy exactOptionalPropertyTypes.
 */

export interface McpTool {
  readonly name: string;
  readonly description?: string | undefined;
  readonly inputSchema?: Readonly<Record<string, unknown>> | undefined;
}

export interface McpContent {
  readonly type: "text" | "image" | "resource";
  readonly text?: string | undefined;
  readonly data?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly uri?: string | undefined;
}

export interface McpToolResult {
  readonly content: readonly McpContent[];
  readonly isError?: boolean | undefined;
}

export interface McpResource {
  readonly uri: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly mimeType?: string | undefined;
}

export interface McpResourceContent {
  readonly uri: string;
  readonly contents: readonly McpContent[];
}

export interface McpPrompt {
  readonly name: string;
  readonly description?: string | undefined;
  readonly arguments?: readonly McpPromptArgument[] | undefined;
}

export interface McpPromptArgument {
  readonly name: string;
  readonly description?: string | undefined;
  readonly required?: boolean | undefined;
}

export interface McpPromptResult {
  readonly description?: string | undefined;
  readonly messages: readonly McpPromptMessage[];
}

export interface McpPromptMessage {
  readonly role: "user" | "assistant";
  readonly content: McpContent;
}

export interface McpServerInfo {
  readonly name: string;
  readonly version: string;
  readonly capabilities: {
    readonly tools?: boolean | undefined;
    readonly resources?: boolean | undefined;
    readonly prompts?: boolean | undefined;
  };
}
