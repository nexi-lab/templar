import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all artifact errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for artifact store errors.
 *
 * Enables generic catch: `if (e instanceof ArtifactError)`
 * while specific subclasses allow precise handling.
 */
export abstract class ArtifactError extends TemplarError {}

// ---------------------------------------------------------------------------
// Artifact not found
// ---------------------------------------------------------------------------

/**
 * Thrown when a requested artifact does not exist.
 */
export class ArtifactNotFoundError extends ArtifactError {
  readonly _tag = "NotFoundError" as const;
  readonly code = "ARTIFACT_NOT_FOUND" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly artifactId: string;

  constructor(artifactId: string) {
    super(`Artifact not found: ${artifactId}`);
    const entry = ERROR_CATALOG.ARTIFACT_NOT_FOUND;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.artifactId = artifactId;
  }
}

// ---------------------------------------------------------------------------
// Artifact validation failed
// ---------------------------------------------------------------------------

/**
 * Thrown when artifact input fails schema validation.
 */
export class ArtifactValidationFailedError extends ArtifactError {
  readonly _tag = "ValidationError" as const;
  readonly code = "ARTIFACT_VALIDATION_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly validationErrors: readonly string[];

  constructor(validationErrors: readonly string[]) {
    super(`Artifact validation failed: ${validationErrors.join("; ")}`);
    const entry = ERROR_CATALOG.ARTIFACT_VALIDATION_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.validationErrors = validationErrors;
  }
}

// ---------------------------------------------------------------------------
// Artifact version conflict
// ---------------------------------------------------------------------------

/**
 * Thrown when a concurrent modification causes a version conflict.
 */
export class ArtifactVersionConflictError extends ArtifactError {
  readonly _tag = "ConflictError" as const;
  readonly code = "ARTIFACT_VERSION_CONFLICT" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly artifactId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(artifactId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Artifact version conflict: ${artifactId} expected v${expectedVersion}, found v${actualVersion}`,
    );
    const entry = ERROR_CATALOG.ARTIFACT_VERSION_CONFLICT;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.artifactId = artifactId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

// ---------------------------------------------------------------------------
// Artifact search failed
// ---------------------------------------------------------------------------

/**
 * Thrown when the artifact search backend returns an error.
 */
export class ArtifactSearchFailedError extends ArtifactError {
  readonly _tag = "ExternalError" as const;
  readonly code = "ARTIFACT_SEARCH_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string, cause?: Error) {
    super(
      `Artifact search failed: ${message}`,
      undefined,
      undefined,
      cause ? { cause } : undefined,
    );
    const entry = ERROR_CATALOG.ARTIFACT_SEARCH_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Artifact store unavailable
// ---------------------------------------------------------------------------

/**
 * Thrown when the artifact storage backend is temporarily unavailable.
 */
export class ArtifactStoreUnavailableError extends ArtifactError {
  readonly _tag = "ExternalError" as const;
  readonly code = "ARTIFACT_STORE_UNAVAILABLE" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;

  constructor(message: string, cause?: Error) {
    super(
      `Artifact store unavailable: ${message}`,
      undefined,
      undefined,
      cause ? { cause } : undefined,
    );
    const entry = ERROR_CATALOG.ARTIFACT_STORE_UNAVAILABLE;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
  }
}

// ---------------------------------------------------------------------------
// Artifact invalid type
// ---------------------------------------------------------------------------

/**
 * Thrown when an artifact has an unsupported type.
 */
export class ArtifactInvalidTypeError extends ArtifactError {
  readonly _tag = "ValidationError" as const;
  readonly code = "ARTIFACT_INVALID_TYPE" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly invalidType: string;

  constructor(invalidType: string) {
    super(`Invalid artifact type: "${invalidType}". Must be "tool" or "agent"`);
    const entry = ERROR_CATALOG.ARTIFACT_INVALID_TYPE;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.invalidType = invalidType;
  }
}
