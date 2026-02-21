import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all collaboration errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for collaboration middleware errors.
 *
 * Enables generic catch: `if (e instanceof CollaborationError)`
 */
export abstract class CollaborationError extends TemplarError {}

// ---------------------------------------------------------------------------
// Configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when a collaboration middleware configuration is invalid.
 */
export class CollaborationConfigurationError extends CollaborationError {
  readonly _tag = "ValidationError" as const;
  readonly code = "COLLABORATION_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string) {
    super(`Invalid collaboration configuration: ${message}`);
    const entry = ERROR_CATALOG.COLLABORATION_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Reaction: pattern invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when a reaction event pattern is syntactically invalid.
 */
export class ReactionPatternInvalidError extends CollaborationError {
  readonly _tag = "ValidationError" as const;
  readonly code = "REACTION_PATTERN_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly pattern: string;

  constructor(pattern: string, message: string) {
    super(`Invalid reaction pattern "${pattern}": ${message}`);
    const entry = ERROR_CATALOG.REACTION_PATTERN_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.pattern = pattern;
  }
}

// ---------------------------------------------------------------------------
// Reaction: cooldown active
// ---------------------------------------------------------------------------

/**
 * Thrown when a reaction pattern is within its cooldown period.
 */
export class ReactionCooldownActiveError extends CollaborationError {
  readonly _tag = "RateLimitError" as const;
  readonly code = "REACTION_COOLDOWN_ACTIVE" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly pattern: string;
  readonly remainingMs: number;

  constructor(pattern: string, remainingMs: number) {
    super(`Reaction pattern "${pattern}" is in cooldown for ${remainingMs}ms`);
    const entry = ERROR_CATALOG.REACTION_COOLDOWN_ACTIVE;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.pattern = pattern;
    this.remainingMs = remainingMs;
  }
}

// ---------------------------------------------------------------------------
// Reaction: event source failed
// ---------------------------------------------------------------------------

/**
 * Thrown when the event source for reaction middleware fails.
 */
export class ReactionEventSourceFailedError extends CollaborationError {
  readonly _tag = "ExternalError" as const;
  readonly code = "REACTION_EVENT_SOURCE_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string, cause?: Error) {
    super(`Event source failed: ${message}`, undefined, undefined, ...(cause ? [{ cause }] : []));
    const entry = ERROR_CATALOG.REACTION_EVENT_SOURCE_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Voice: drift exceeded
// ---------------------------------------------------------------------------

/**
 * Thrown when personality modifier total weight exceeds the drift cap.
 */
export class VoiceDriftExceededError extends CollaborationError {
  readonly _tag = "ValidationError" as const;
  readonly code = "VOICE_DRIFT_EXCEEDED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly totalWeight: number;
  readonly maxDrift: number;

  constructor(totalWeight: number, maxDrift: number) {
    super(`Voice drift exceeded: total weight ${totalWeight.toFixed(3)} exceeds max ${maxDrift}`);
    const entry = ERROR_CATALOG.VOICE_DRIFT_EXCEEDED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.totalWeight = totalWeight;
    this.maxDrift = maxDrift;
  }
}

// ---------------------------------------------------------------------------
// Voice: memory query failed
// ---------------------------------------------------------------------------

/**
 * Thrown when querying Nexus Memory for personality modifiers fails.
 */
export class VoiceMemoryQueryFailedError extends CollaborationError {
  readonly _tag = "ExternalError" as const;
  readonly code = "VOICE_MEMORY_QUERY_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string, cause?: Error) {
    super(
      `Voice memory query failed: ${message}`,
      undefined,
      undefined,
      ...(cause ? [{ cause }] : []),
    );
    const entry = ERROR_CATALOG.VOICE_MEMORY_QUERY_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Voice: modifier update timeout
// ---------------------------------------------------------------------------

/**
 * Thrown when the personality modifier update exceeds its timeout.
 */
export class VoiceModifierUpdateTimeoutError extends CollaborationError {
  readonly _tag = "TimeoutError" as const;
  readonly code = "VOICE_MODIFIER_UPDATE_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly elapsedMs: number;

  constructor(elapsedMs: number) {
    super(`Voice modifier update exceeded timeout of ${elapsedMs}ms`);
    const entry = ERROR_CATALOG.VOICE_MODIFIER_UPDATE_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.elapsedMs = elapsedMs;
  }
}

// ---------------------------------------------------------------------------
// Distillation: extraction failed
// ---------------------------------------------------------------------------

/**
 * Thrown when memory extraction from conversation fails.
 */
export class DistillationExtractionFailedError extends CollaborationError {
  readonly _tag = "ExternalError" as const;
  readonly code = "DISTILLATION_EXTRACTION_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string, cause?: Error) {
    super(
      `Distillation extraction failed: ${message}`,
      undefined,
      undefined,
      ...(cause ? [{ cause }] : []),
    );
    const entry = ERROR_CATALOG.DISTILLATION_EXTRACTION_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Distillation: extraction timeout
// ---------------------------------------------------------------------------

/**
 * Thrown when memory extraction exceeds its timeout.
 */
export class DistillationExtractionTimeoutError extends CollaborationError {
  readonly _tag = "TimeoutError" as const;
  readonly code = "DISTILLATION_EXTRACTION_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Distillation extraction exceeded timeout of ${timeoutMs}ms`);
    const entry = ERROR_CATALOG.DISTILLATION_EXTRACTION_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.timeoutMs = timeoutMs;
  }
}
