export const PACKAGE_NAME = "@templar/errors" as const;

/**
 * Base error class for all Templar errors
 */
export class TemplarError extends Error {
	constructor(
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = this.constructor.name;
		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if ("captureStackTrace" in Error && typeof Error.captureStackTrace === "function") {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

/**
 * Thrown when Templar configuration is invalid
 */
export class TemplarConfigError extends TemplarError {
	constructor(
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}

/**
 * Thrown when Nexus client validation fails
 */
export class NexusClientError extends TemplarError {
	constructor(
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}

/**
 * Thrown when agent manifest validation fails
 */
export class ManifestValidationError extends TemplarError {
	constructor(
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}
