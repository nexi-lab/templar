import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all spawn governance errors (#163)
// ---------------------------------------------------------------------------

/**
 * Abstract base class for spawn governance errors.
 *
 * Enables generic catch: `if (e instanceof SpawnGovernanceError)`
 * while specific subclasses allow precise handling:
 * `if (e instanceof SpawnDepthExceededError)`
 */
export abstract class SpawnGovernanceError extends TemplarError {}

// ---------------------------------------------------------------------------
// Spawn depth exceeded
// ---------------------------------------------------------------------------

/**
 * Thrown when a sub-agent spawn attempt exceeds the maximum spawn depth.
 */
export class SpawnDepthExceededError extends SpawnGovernanceError {
  readonly _tag = "SpawnGovernanceError" as const;
  readonly code = "ENGINE_SPAWN_DEPTH_EXCEEDED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly currentDepth: number;
  readonly maxSpawnDepth: number;

  constructor(currentDepth: number, maxSpawnDepth: number) {
    super(`Spawn depth ${currentDepth} exceeds maximum allowed depth ${maxSpawnDepth}`);
    const entry = ERROR_CATALOG.ENGINE_SPAWN_DEPTH_EXCEEDED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.currentDepth = currentDepth;
    this.maxSpawnDepth = maxSpawnDepth;
  }
}

// ---------------------------------------------------------------------------
// Child limit exceeded
// ---------------------------------------------------------------------------

/**
 * Thrown when a parent agent exceeds its maximum number of concurrent children.
 */
export class SpawnChildLimitError extends SpawnGovernanceError {
  readonly _tag = "SpawnGovernanceError" as const;
  readonly code = "ENGINE_SPAWN_CHILD_LIMIT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly parentAgentId: string;
  readonly activeChildren: number;
  readonly maxChildrenPerAgent: number;

  constructor(parentAgentId: string, activeChildren: number, maxChildrenPerAgent: number) {
    super(
      `Parent agent "${parentAgentId}" has ${activeChildren} active children (limit: ${maxChildrenPerAgent})`,
    );
    const entry = ERROR_CATALOG.ENGINE_SPAWN_CHILD_LIMIT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.parentAgentId = parentAgentId;
    this.activeChildren = activeChildren;
    this.maxChildrenPerAgent = maxChildrenPerAgent;
  }
}

// ---------------------------------------------------------------------------
// Concurrency limit exceeded
// ---------------------------------------------------------------------------

/**
 * Thrown when the total concurrent sub-agents across the orchestration tree
 * reaches the configured maximum.
 */
export class SpawnConcurrencyLimitError extends SpawnGovernanceError {
  readonly _tag = "SpawnGovernanceError" as const;
  readonly code = "ENGINE_SPAWN_CONCURRENCY_LIMIT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly activeConcurrent: number;
  readonly maxConcurrent: number;

  constructor(activeConcurrent: number, maxConcurrent: number) {
    super(`Concurrent sub-agents (${activeConcurrent}) reached limit (${maxConcurrent})`);
    const entry = ERROR_CATALOG.ENGINE_SPAWN_CONCURRENCY_LIMIT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.activeConcurrent = activeConcurrent;
    this.maxConcurrent = maxConcurrent;
  }
}

// ---------------------------------------------------------------------------
// Tool denied at depth
// ---------------------------------------------------------------------------

/**
 * Thrown when a tool is denied by the depth-aware tool policy.
 */
export class SpawnToolDeniedError extends SpawnGovernanceError {
  readonly _tag = "SpawnGovernanceError" as const;
  readonly code = "ENGINE_SPAWN_TOOL_DENIED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly toolName: string;
  readonly currentDepth: number;

  constructor(toolName: string, currentDepth: number) {
    super(`Tool "${toolName}" is denied at spawn depth ${currentDepth} by depth-aware tool policy`);
    const entry = ERROR_CATALOG.ENGINE_SPAWN_TOOL_DENIED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.toolName = toolName;
    this.currentDepth = currentDepth;
  }
}
