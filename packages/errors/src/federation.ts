import { TemplarError } from "./base.js";
import {
	ERROR_CATALOG,
	type ErrorDomain,
	type GrpcStatusCode,
	type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Base class for all federation errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for federation errors.
 *
 * Enables generic catch: `if (e instanceof FederationError)`
 */
export abstract class FederationError extends TemplarError {}

// ---------------------------------------------------------------------------
// Zone: not found
// ---------------------------------------------------------------------------

export class FederationZoneNotFoundError extends FederationError {
	readonly _tag = "NotFoundError" as const;
	readonly code = "FEDERATION_ZONE_NOT_FOUND" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;
	readonly zoneId: string;

	constructor(zoneId: string) {
		super(`Zone '${zoneId}' not found`);
		const entry = ERROR_CATALOG.FEDERATION_ZONE_NOT_FOUND;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
		this.zoneId = zoneId;
	}
}

// ---------------------------------------------------------------------------
// Zone: already exists
// ---------------------------------------------------------------------------

export class FederationZoneAlreadyExistsError extends FederationError {
	readonly _tag = "ConflictError" as const;
	readonly code = "FEDERATION_ZONE_ALREADY_EXISTS" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;
	readonly zoneId: string;

	constructor(zoneId: string) {
		super(`Zone '${zoneId}' already exists`);
		const entry = ERROR_CATALOG.FEDERATION_ZONE_ALREADY_EXISTS;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
		this.zoneId = zoneId;
	}
}

// ---------------------------------------------------------------------------
// Zone: invalid ID
// ---------------------------------------------------------------------------

export class FederationZoneInvalidIdError extends FederationError {
	readonly _tag = "ValidationError" as const;
	readonly code = "FEDERATION_ZONE_INVALID_ID" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;
	readonly zoneId: string;

	constructor(zoneId: string, message: string) {
		super(`Invalid zone ID '${zoneId}': ${message}`);
		const entry = ERROR_CATALOG.FEDERATION_ZONE_INVALID_ID;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
		this.zoneId = zoneId;
	}
}

// ---------------------------------------------------------------------------
// Zone: terminating
// ---------------------------------------------------------------------------

export class FederationZoneTerminatingError extends FederationError {
	readonly _tag = "ConflictError" as const;
	readonly code = "FEDERATION_ZONE_TERMINATING" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;
	readonly zoneId: string;
	readonly phase: string;

	constructor(zoneId: string, phase: string) {
		super(`Zone '${zoneId}' is ${phase} and cannot accept new operations`);
		const entry = ERROR_CATALOG.FEDERATION_ZONE_TERMINATING;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
		this.zoneId = zoneId;
		this.phase = phase;
	}
}

// ---------------------------------------------------------------------------
// Zone: share failed
// ---------------------------------------------------------------------------

export class FederationZoneShareFailedError extends FederationError {
	readonly _tag = "ExternalError" as const;
	readonly code = "FEDERATION_ZONE_SHARE_FAILED" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;
	readonly zoneId: string;

	constructor(zoneId: string, message: string, cause?: Error) {
		super(
			`Zone share failed for '${zoneId}': ${message}`,
			undefined,
			undefined,
			...(cause ? [{ cause }] : []),
		);
		const entry = ERROR_CATALOG.FEDERATION_ZONE_SHARE_FAILED;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
		this.zoneId = zoneId;
	}
}

// ---------------------------------------------------------------------------
// Zone: join failed
// ---------------------------------------------------------------------------

export class FederationZoneJoinFailedError extends FederationError {
	readonly _tag = "ExternalError" as const;
	readonly code = "FEDERATION_ZONE_JOIN_FAILED" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;
	readonly zoneId: string;

	constructor(zoneId: string, message: string, cause?: Error) {
		super(
			`Zone join failed for '${zoneId}': ${message}`,
			undefined,
			undefined,
			...(cause ? [{ cause }] : []),
		);
		const entry = ERROR_CATALOG.FEDERATION_ZONE_JOIN_FAILED;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
		this.zoneId = zoneId;
	}
}

// ---------------------------------------------------------------------------
// Sync: disconnected
// ---------------------------------------------------------------------------

export class FederationSyncDisconnectedError extends FederationError {
	readonly _tag = "ExternalError" as const;
	readonly code = "FEDERATION_SYNC_DISCONNECTED" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;

	constructor(message: string) {
		super(`Edge sync disconnected: ${message}`);
		const entry = ERROR_CATALOG.FEDERATION_SYNC_DISCONNECTED;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
	}
}

// ---------------------------------------------------------------------------
// Sync: auth failed
// ---------------------------------------------------------------------------

export class FederationSyncAuthFailedError extends FederationError {
	readonly _tag = "PermissionError" as const;
	readonly code = "FEDERATION_SYNC_AUTH_FAILED" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;

	constructor(message: string, cause?: Error) {
		super(
			`Edge sync auth refresh failed: ${message}`,
			undefined,
			undefined,
			...(cause ? [{ cause }] : []),
		);
		const entry = ERROR_CATALOG.FEDERATION_SYNC_AUTH_FAILED;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
	}
}

// ---------------------------------------------------------------------------
// Sync: timeout
// ---------------------------------------------------------------------------

export class FederationSyncTimeoutError extends FederationError {
	readonly _tag = "TimeoutError" as const;
	readonly code = "FEDERATION_SYNC_TIMEOUT" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;
	readonly timeoutMs: number;
	readonly phaseName: string;

	constructor(timeoutMs: number, phaseName: string) {
		super(`Edge sync phase '${phaseName}' exceeded timeout of ${timeoutMs}ms`);
		const entry = ERROR_CATALOG.FEDERATION_SYNC_TIMEOUT;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
		this.timeoutMs = timeoutMs;
		this.phaseName = phaseName;
	}
}

// ---------------------------------------------------------------------------
// Conflict: unresolved
// ---------------------------------------------------------------------------

export class FederationConflictUnresolvedError extends FederationError {
	readonly _tag = "ConflictError" as const;
	readonly code = "FEDERATION_CONFLICT_UNRESOLVED" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;

	constructor(message: string) {
		super(`Unresolved conflict: ${message}`);
		const entry = ERROR_CATALOG.FEDERATION_CONFLICT_UNRESOLVED;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
	}
}

// ---------------------------------------------------------------------------
// Sync: invalid transition
// ---------------------------------------------------------------------------

export class FederationSyncInvalidTransitionError extends FederationError {
	readonly _tag = "ValidationError" as const;
	readonly code = "FEDERATION_SYNC_INVALID_TRANSITION" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;
	readonly from: string;
	readonly to: string;

	constructor(from: string, to: string) {
		super(`Invalid sync state transition from '${from}' to '${to}'`);
		const entry = ERROR_CATALOG.FEDERATION_SYNC_INVALID_TRANSITION;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
		this.from = from;
		this.to = to;
	}
}

// ---------------------------------------------------------------------------
// Configuration: invalid
// ---------------------------------------------------------------------------

export class FederationConfigurationInvalidError extends FederationError {
	readonly _tag = "ValidationError" as const;
	readonly code = "FEDERATION_CONFIGURATION_INVALID" as const;
	readonly httpStatus: HttpStatusCode;
	readonly grpcCode: GrpcStatusCode;
	readonly domain: ErrorDomain;
	readonly isExpected: boolean;

	constructor(message: string) {
		super(`Invalid federation configuration: ${message}`);
		const entry = ERROR_CATALOG.FEDERATION_CONFIGURATION_INVALID;
		this.httpStatus = entry.httpStatus as HttpStatusCode;
		this.grpcCode = entry.grpcCode as GrpcStatusCode;
		this.domain = entry.domain as ErrorDomain;
		this.isExpected = entry.isExpected;
	}
}
