import { TemplarError } from "./base.js";
import {
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Abstract base for all plugin errors
// ---------------------------------------------------------------------------

/**
 * Abstract base class for plugin system errors.
 *
 * Enables generic catch: `if (e instanceof PluginError)`
 */
export abstract class PluginError extends TemplarError {}

// ---------------------------------------------------------------------------
// Configuration invalid
// ---------------------------------------------------------------------------

/**
 * Thrown when plugin configuration is invalid.
 */
export class PluginConfigurationError extends PluginError {
  readonly _tag = "PluginError" as const;
  readonly code = "PLUGIN_CONFIGURATION_INVALID" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly validationErrors: readonly string[];

  constructor(validationErrors: readonly string[]) {
    super(`Invalid plugin configuration: ${validationErrors.join("; ")}`);
    const entry = ERROR_CATALOG.PLUGIN_CONFIGURATION_INVALID;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.validationErrors = validationErrors;
  }
}

// ---------------------------------------------------------------------------
// Load failed (discovery / import / validate)
// ---------------------------------------------------------------------------

/** Phase of plugin loading where the failure occurred. */
export type PluginLoadPhase = "discovery" | "import" | "validate";

/**
 * Thrown when a plugin fails to load during discovery, import, or validation.
 */
export class PluginLoadError extends PluginError {
  readonly _tag = "PluginError" as const;
  readonly code = "PLUGIN_LOAD_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly pluginName: string;
  readonly phase: PluginLoadPhase;

  constructor(pluginName: string, phase: PluginLoadPhase, message: string) {
    super(`Plugin load failed [${phase}] "${pluginName}": ${message}`);
    const entry = ERROR_CATALOG.PLUGIN_LOAD_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.pluginName = pluginName;
    this.phase = phase;
  }
}

// ---------------------------------------------------------------------------
// Capability denied
// ---------------------------------------------------------------------------

/**
 * Thrown when a plugin attempts to use a capability it did not declare
 * or that its trust tier does not allow.
 */
export class PluginCapabilityError extends PluginError {
  readonly _tag = "PluginError" as const;
  readonly code = "PLUGIN_CAPABILITY_DENIED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly pluginName: string;
  readonly capability: string;

  constructor(pluginName: string, capability: string, reason: string) {
    super(`Plugin "${pluginName}" capability denied "${capability}": ${reason}`);
    const entry = ERROR_CATALOG.PLUGIN_CAPABILITY_DENIED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.pluginName = pluginName;
    this.capability = capability;
  }
}

// ---------------------------------------------------------------------------
// Registration failed
// ---------------------------------------------------------------------------

/**
 * Thrown when plugin registration fails (duplicate name, bad tool, etc.).
 */
export class PluginRegistrationError extends PluginError {
  readonly _tag = "PluginError" as const;
  readonly code = "PLUGIN_REGISTRATION_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly pluginName: string;

  constructor(pluginName: string, message: string) {
    super(`Plugin registration failed "${pluginName}": ${message}`);
    const entry = ERROR_CATALOG.PLUGIN_REGISTRATION_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.pluginName = pluginName;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle failed
// ---------------------------------------------------------------------------

/**
 * Thrown when a plugin's register() or teardown() call throws.
 */
export class PluginLifecycleError extends PluginError {
  readonly _tag = "PluginError" as const;
  readonly code = "PLUGIN_LIFECYCLE_FAILED" as const;
  readonly httpStatus: HttpStatusCode;
  readonly grpcCode: GrpcStatusCode;
  readonly domain: ErrorDomain;
  readonly isExpected: boolean;
  readonly pluginName: string;
  readonly lifecycle: "register" | "teardown";

  constructor(pluginName: string, lifecycle: "register" | "teardown", message: string) {
    super(`Plugin ${lifecycle}() failed "${pluginName}": ${message}`);
    const entry = ERROR_CATALOG.PLUGIN_LIFECYCLE_FAILED;
    this.httpStatus = entry.httpStatus as HttpStatusCode;
    this.grpcCode = entry.grpcCode as GrpcStatusCode;
    this.domain = entry.domain as ErrorDomain;
    this.isExpected = entry.isExpected;
    this.pluginName = pluginName;
    this.lifecycle = lifecycle;
  }
}
