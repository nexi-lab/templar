/**
 * Artifact tools — LangGraph-compatible tool definitions for agent use.
 *
 * Provides two tools:
 * - `create_artifact`: Create persistent tool or agent artifacts
 * - `search_artifacts`: Search for existing artifacts by natural language
 *
 * Uses the factory pattern: `createArtifactTools(client)` returns both
 * tool definitions (ToolConfig[]) and an execute function for runtime dispatch.
 *
 * @example
 * ```typescript
 * import { ArtifactClient } from '@templar/artifact-client';
 * import { createArtifactTools } from '@templar/artifact-client/tools';
 *
 * const client = new ArtifactClient(nexusClient);
 * const { tools, execute } = createArtifactTools(client);
 *
 * // Register tools with engine
 * config.tools = [...config.tools, ...tools];
 *
 * // Execute via middleware wrapToolCall
 * const result = await execute('create_artifact', { name: 'calc', ... });
 * ```
 */

import type { ToolConfig } from "@templar/core";
import {
  ArtifactSearchFailedError,
  ArtifactStoreUnavailableError,
  ArtifactValidationFailedError,
} from "@templar/errors";
import type { ArtifactClient } from "../client.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of a successful tool execution */
export interface ArtifactToolSuccess {
  readonly success: true;
  readonly [key: string]: unknown;
}

/** Result of a failed tool execution */
export interface ArtifactToolFailure {
  readonly success: false;
  readonly error: string;
}

/** Union of tool execution results */
export type ArtifactToolResult = ArtifactToolSuccess | ArtifactToolFailure;

/** The complete tool set returned by createArtifactTools */
export interface ArtifactToolSet {
  /** Tool definitions for registration with the engine */
  readonly tools: readonly ToolConfig[];
  /** Execute a tool by name with the given input */
  readonly execute: (
    toolName: string,
    input: Record<string, unknown>,
  ) => Promise<ArtifactToolResult>;
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema)
// ---------------------------------------------------------------------------

const CREATE_ARTIFACT_TOOL: ToolConfig = Object.freeze({
  name: "create_artifact",
  description:
    "Create a persistent tool or agent artifact that can be reused across sessions. " +
    "Tool artifacts store JSON schemas for reusable tool definitions. " +
    "Agent artifacts store manifests for spawnable specialist agents.",
  parameters: Object.freeze({
    type: "object",
    properties: Object.freeze({
      name: Object.freeze({
        type: "string",
        description: "Unique name for the artifact",
      }),
      description: Object.freeze({
        type: "string",
        description: "Human-readable description of what the artifact does",
      }),
      artifact_type: Object.freeze({
        type: "string",
        enum: ["tool", "agent"],
        description: 'Whether this is a "tool" (schema) or "agent" (manifest) artifact',
      }),
      tags: Object.freeze({
        type: "array",
        items: Object.freeze({ type: "string" }),
        description: "Categorization tags for discovery",
      }),
      schema: Object.freeze({
        type: "object",
        description: "JSON Schema for tool artifacts (required when artifact_type is tool)",
      }),
      manifest: Object.freeze({
        type: "object",
        description:
          "Agent manifest for agent artifacts (required when artifact_type is agent). " +
          "Contains model, tools, systemPrompt, middleware config.",
      }),
    }),
    required: Object.freeze(["name", "description", "artifact_type"]),
  }),
});

const SEARCH_ARTIFACTS_TOOL: ToolConfig = Object.freeze({
  name: "search_artifacts",
  description:
    "Search for existing artifacts using natural language. " +
    "Returns matching tool and agent artifacts ranked by relevance. " +
    "Use this to find reusable tools or specialist agents before creating new ones.",
  parameters: Object.freeze({
    type: "object",
    properties: Object.freeze({
      query: Object.freeze({
        type: "string",
        description: "Natural language search query describing what you need",
      }),
      type: Object.freeze({
        type: "string",
        enum: ["tool", "agent"],
        description: "Filter results by artifact type",
      }),
      tags: Object.freeze({
        type: "array",
        items: Object.freeze({ type: "string" }),
        description: "Filter results by tags (all specified tags must be present)",
      }),
      limit: Object.freeze({
        type: "number",
        description: "Maximum number of results to return (default: 10)",
      }),
    }),
    required: Object.freeze(["query"]),
  }),
});

const ARTIFACT_TOOLS: readonly ToolConfig[] = Object.freeze([
  CREATE_ARTIFACT_TOOL,
  SEARCH_ARTIFACTS_TOOL,
]);

// ---------------------------------------------------------------------------
// Execution handlers
// ---------------------------------------------------------------------------

async function handleCreate(
  client: ArtifactClient,
  input: Record<string, unknown>,
): Promise<ArtifactToolResult> {
  const name = input.name as string | undefined;
  const description = input.description as string | undefined;
  const artifactType = input.artifact_type as string | undefined;
  const tags = input.tags as string[] | undefined;
  const schema = input.schema as Record<string, unknown> | undefined;
  const manifest = input.manifest as Record<string, unknown> | undefined;

  try {
    const baseName = name ?? "";
    const baseDesc = description ?? "";

    // Pre-validate required type-specific fields before constructing params.
    // This gives clear error messages before we hit the type discriminant.
    if (artifactType === "tool" && schema === undefined) {
      return {
        success: false,
        error: "Artifact validation failed: tool artifacts must include a schema",
      };
    }
    if (artifactType === "agent" && manifest === undefined) {
      return {
        success: false,
        error: "Artifact validation failed: agent artifacts must include a manifest",
      };
    }

    const params =
      artifactType === "tool"
        ? {
            name: baseName,
            description: baseDesc,
            type: "tool" as const,
            schema: schema as Record<string, unknown>,
            ...(tags !== undefined ? { tags } : {}),
          }
        : artifactType === "agent"
          ? {
              name: baseName,
              description: baseDesc,
              type: "agent" as const,
              manifest: manifest as Record<string, unknown>,
              ...(tags !== undefined ? { tags } : {}),
            }
          : {
              name: baseName,
              description: baseDesc,
              type: (artifactType ?? "") as "tool",
              schema: {} as Record<string, unknown>,
              ...(tags !== undefined ? { tags } : {}),
            };

    const artifact = await client.create(params);

    return {
      success: true,
      artifact: {
        id: artifact.id,
        name: artifact.name,
        type: artifact.type,
        version: artifact.version,
      },
    };
  } catch (error) {
    if (error instanceof ArtifactValidationFailedError) {
      return { success: false, error: error.message };
    }
    if (error instanceof ArtifactStoreUnavailableError) {
      return { success: false, error: "Artifact store unavailable. Try again later." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error creating artifact",
    };
  }
}

async function handleSearch(
  client: ArtifactClient,
  input: Record<string, unknown>,
): Promise<ArtifactToolResult> {
  const query = input.query as string | undefined;
  const type = input.type as "tool" | "agent" | undefined;
  const tags = input.tags as string[] | undefined;
  const limit = input.limit as number | undefined;

  if (!query || query.trim().length === 0) {
    return { success: false, error: "query must be a non-empty string" };
  }

  try {
    const results = await client.search({
      query,
      ...(type !== undefined ? { type } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });

    return {
      success: true,
      results: results.map((r) => ({
        id: r.artifact.id,
        name: r.artifact.name,
        description: r.artifact.description,
        type: r.artifact.type,
        tags: r.artifact.tags,
        score: r.score,
      })),
    };
  } catch (error) {
    if (error instanceof ArtifactSearchFailedError) {
      return { success: false, error: `Artifact search failed: ${error.message}` };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error searching artifacts",
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create artifact tools for agent use.
 *
 * Returns tool definitions (for engine registration) and an execute function
 * (for runtime dispatch via middleware wrapToolCall).
 *
 * @param client - The ArtifactClient to use for operations
 * @returns Tool definitions and execution handler
 */
export function createArtifactTools(client: ArtifactClient): ArtifactToolSet {
  async function execute(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<ArtifactToolResult> {
    switch (toolName) {
      case "create_artifact":
        return handleCreate(client, input);
      case "search_artifacts":
        return handleSearch(client, input);
      default:
        return { success: false, error: `Unknown artifact tool: ${toolName}` };
    }
  }

  return { tools: ARTIFACT_TOOLS, execute };
}
