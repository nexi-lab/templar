import type { AgentManifest, NexusClient } from "@templar/core";
import { ManifestValidationError, NexusClientError, TemplarConfigError } from "@templar/errors";

/**
 * Valid agent type values
 */
const VALID_AGENT_TYPES = ["high", "dark"] as const;

/**
 * Validates agentType is one of the allowed values
 * @throws {TemplarConfigError} if agentType is invalid
 */
export function validateAgentType(
  agentType: string | undefined,
): asserts agentType is "high" | "dark" | undefined {
  if (agentType === undefined) {
    return;
  }

  if (!VALID_AGENT_TYPES.includes(agentType as "high" | "dark")) {
    throw new TemplarConfigError(
      `Invalid agentType: "${agentType}". Must be one of: ${VALID_AGENT_TYPES.join(", ")}`,
    );
  }
}

/**
 * Validates Nexus client is properly initialized
 * @throws {NexusClientError} if client is not properly initialized
 */
export function validateNexusClient(
  client: NexusClient | undefined,
): asserts client is NexusClient | undefined {
  if (client === undefined) {
    return;
  }

  // Check if client has required methods/properties
  if (typeof client !== "object" || client === null) {
    throw new NexusClientError(`Nexus client must be an object. Received: ${typeof client}`);
  }

  // Check for required resource properties (from @nexus/sdk NexusClient)
  const requiredResources = ["agents", "memory"];
  for (const resource of requiredResources) {
    if (typeof (client as unknown as Record<string, unknown>)[resource] !== "object") {
      throw new NexusClientError(
        `Nexus client must have a '${resource}' resource. Client appears to be uninitialized.`,
      );
    }
  }
}

/**
 * Validates agent manifest structure
 * @throws {ManifestValidationError} if manifest is invalid
 */
export function validateManifest(
  manifest: AgentManifest | undefined,
): asserts manifest is AgentManifest | undefined {
  if (manifest === undefined) {
    return;
  }

  if (typeof manifest !== "object" || manifest === null) {
    throw new ManifestValidationError(`Manifest must be an object. Received: ${typeof manifest}`);
  }

  // Required fields
  const requiredFields: (keyof AgentManifest)[] = ["name", "version", "description"];

  for (const field of requiredFields) {
    if (!(field in manifest)) {
      throw new ManifestValidationError(`Manifest is missing required field: "${field}"`);
    }

    if (typeof manifest[field] !== "string" || manifest[field] === "") {
      throw new ManifestValidationError(`Manifest field "${field}" must be a non-empty string`);
    }
  }

  // Validate version format (semver-like)
  const versionRegex = /^\d+\.\d+\.\d+/;
  if (!versionRegex.test(manifest.version)) {
    throw new ManifestValidationError(
      `Manifest version "${manifest.version}" must follow semver format (e.g., "1.0.0")`,
    );
  }

  // Validate arrays are arrays (if present)
  if (manifest.tools !== undefined && !Array.isArray(manifest.tools)) {
    throw new ManifestValidationError("Manifest field 'tools' must be an array");
  }

  if (manifest.channels !== undefined && !Array.isArray(manifest.channels)) {
    throw new ManifestValidationError("Manifest field 'channels' must be an array");
  }

  if (manifest.middleware !== undefined && !Array.isArray(manifest.middleware)) {
    throw new ManifestValidationError("Manifest field 'middleware' must be an array");
  }
}
