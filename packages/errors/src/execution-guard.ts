import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all execution guard errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for execution safety guard errors.
 *
 * Enables generic catch: `if (e instanceof ExecutionGuardError)`
 * while specific subclasses allow precise handling:
 * `if (e instanceof IterationLimitError)`
 */
export abstract class ExecutionGuardError extends TemplarError {}

// ---------------------------------------------------------------------------
// Iteration limit exceeded
// ---------------------------------------------------------------------------

/**
 * Thrown when the hard iteration limit is reached.
 */
export class IterationLimitError extends ExecutionGuardError {
  readonly _tag = "ExecutionGuardError" as const;
  readonly code = "ENGINE_ITERATION_LIMIT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly iterationCount: number;
  readonly maxIterations: number;

  constructor(iterationCount: number, maxIterations: number) {
    super(`Agent exceeded maximum iterations: ${iterationCount}/${maxIterations}`);
    const entry = ERROR_CATALOG.ENGINE_ITERATION_LIMIT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.iterationCount = iterationCount;
    this.maxIterations = maxIterations;
  }
}

// ---------------------------------------------------------------------------
// Loop detected
// ---------------------------------------------------------------------------

/** Loop detection result shape (structurally compatible with @templar/core LoopDetection) */
interface LoopDetectionDetail {
  readonly type: "tool_cycle" | "output_repeat";
  readonly cyclePattern?: readonly string[];
  readonly repetitions: number;
  readonly windowSize: number;
}

/**
 * Thrown when loop detection identifies a repeating pattern.
 */
export class LoopDetectedError extends ExecutionGuardError {
  readonly _tag = "ExecutionGuardError" as const;
  readonly code = "ENGINE_LOOP_DETECTED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly detection: LoopDetectionDetail;

  constructor(detection: LoopDetectionDetail) {
    const detail =
      detection.type === "tool_cycle"
        ? `tool cycle [${detection.cyclePattern?.join(" \u2192 ")}] repeated ${detection.repetitions}x`
        : `identical output repeated ${detection.repetitions}x`;
    super(`Agent loop detected: ${detail}`);
    const entry = ERROR_CATALOG.ENGINE_LOOP_DETECTED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.detection = detection;
  }
}

// ---------------------------------------------------------------------------
// Execution timeout
// ---------------------------------------------------------------------------

/**
 * Thrown when the wall-clock execution timeout is exceeded.
 */
export class ExecutionTimeoutError extends ExecutionGuardError {
  readonly _tag = "ExecutionGuardError" as const;
  readonly code = "ENGINE_EXECUTION_TIMEOUT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly elapsedMs: number;
  readonly maxMs: number;

  constructor(elapsedMs: number, maxMs: number) {
    super(`Agent execution timed out after ${elapsedMs}ms (limit: ${maxMs}ms)`);
    const entry = ERROR_CATALOG.ENGINE_EXECUTION_TIMEOUT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.elapsedMs = elapsedMs;
    this.maxMs = maxMs;
  }
}
