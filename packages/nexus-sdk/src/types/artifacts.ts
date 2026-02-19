/**
 * Types for artifact resources
 */

import type { PaginatedResponse, PaginationParams } from "./index.js";

/**
 * Artifact status
 */
export type ArtifactStatus = "active" | "inactive" | "deprecated";

/**
 * Artifact type discriminant
 */
export type ArtifactType = "tool" | "agent";

/**
 * Shared fields across all artifact types
 */
export interface ArtifactBase {
  /** Unique artifact identifier */
  readonly id: string;
  /** Artifact name */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Artifact type discriminant */
  readonly type: ArtifactType;
  /** Categorization tags */
  readonly tags: readonly string[];
  /** Auto-incrementing version number */
  readonly version: number;
  /** Artifact lifecycle status */
  readonly status: ArtifactStatus;
  /** ID of the agent or user that created this artifact */
  readonly createdBy: string;
  /** Creation timestamp (ISO 8601) */
  readonly createdAt: string;
  /** Last update timestamp (ISO 8601) */
  readonly updatedAt: string;
}

/**
 * Tool artifact — a declarative tool definition (schema only, no executable code)
 */
export interface ToolArtifact extends ArtifactBase {
  readonly type: "tool";
  /** JSON Schema describing the tool's input/output */
  readonly schema: Record<string, unknown>;
}

/**
 * Agent artifact — a reusable agent manifest definition
 */
export interface AgentArtifact extends ArtifactBase {
  readonly type: "agent";
  /** Agent manifest (validated AgentManifest structure) */
  readonly manifest: Record<string, unknown>;
}

/**
 * Discriminated union of all artifact types
 */
export type Artifact = ToolArtifact | AgentArtifact;

/**
 * Lightweight artifact metadata for discovery (no schema/manifest payload)
 */
export interface ArtifactMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: ArtifactType;
  readonly tags: readonly string[];
  readonly version: number;
  readonly status: ArtifactStatus;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Parameters for creating a tool artifact
 */
export interface CreateToolArtifactParams {
  readonly name: string;
  readonly description: string;
  readonly type: "tool";
  readonly tags?: readonly string[];
  readonly schema: Record<string, unknown>;
}

/**
 * Parameters for creating an agent artifact
 */
export interface CreateAgentArtifactParams {
  readonly name: string;
  readonly description: string;
  readonly type: "agent";
  readonly tags?: readonly string[];
  readonly manifest: Record<string, unknown>;
}

/**
 * Union of creation parameter types
 */
export type CreateArtifactParams = CreateToolArtifactParams | CreateAgentArtifactParams;

/**
 * Parameters for updating an artifact
 */
export interface UpdateArtifactParams {
  readonly name?: string;
  readonly description?: string;
  readonly status?: ArtifactStatus;
  readonly tags?: readonly string[];
  readonly schema?: Record<string, unknown>;
  readonly manifest?: Record<string, unknown>;
  /** Expected version for optimistic concurrency (optional) */
  readonly expectedVersion?: number;
}

/**
 * Parameters for listing artifacts
 */
export interface ListArtifactsParams extends PaginationParams {
  /** Filter by artifact type */
  readonly type?: ArtifactType;
  /** Filter by status */
  readonly status?: ArtifactStatus;
  /** Filter by tags (all specified tags must be present) */
  readonly tags?: readonly string[];
  /** Filter by creator */
  readonly createdBy?: string;
}

/**
 * Parameters for semantic search
 */
export interface SearchArtifactsParams {
  /** Natural language query for semantic search */
  readonly query: string;
  /** Filter by artifact type */
  readonly type?: ArtifactType;
  /** Filter by tags */
  readonly tags?: readonly string[];
  /** Filter by status */
  readonly status?: ArtifactStatus;
  /** Maximum number of results */
  readonly limit?: number;
}

/**
 * Search result with relevance score
 */
export interface ArtifactSearchResult {
  readonly artifact: ArtifactMetadata;
  readonly score: number;
}

/**
 * Paginated artifacts response
 */
export type ArtifactsResponse = PaginatedResponse<ArtifactMetadata>;

/**
 * Search results response
 */
export interface ArtifactSearchResponse {
  readonly results: readonly ArtifactSearchResult[];
}

/**
 * Parameters for batch get
 */
export interface GetArtifactsBatchParams {
  readonly ids: readonly string[];
}

/**
 * Batch get response
 */
export interface ArtifactsBatchResponse {
  readonly artifacts: readonly Artifact[];
}
