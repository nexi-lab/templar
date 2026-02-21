/**
 * Shared validation for artifact params.
 *
 * Used by both ArtifactClient and InMemoryArtifactStore to ensure
 * consistent validation regardless of whether Nexus is available.
 */

import type { CreateArtifactParams, UpdateArtifactParams } from "@nexus/sdk";
import { ArtifactValidationFailedError } from "@templar/errors";

/** Maximum number of tags per artifact */
const MAX_TAGS = 50;

/** Maximum tag length in characters */
const MAX_TAG_LENGTH = 100;

/** Maximum name length in characters */
const MAX_NAME_LENGTH = 256;

/**
 * Validate parameters for creating an artifact.
 *
 * Checks:
 * - name is non-empty and within length limit
 * - description is non-empty
 * - type is "tool" or "agent"
 * - tool artifacts have a schema
 * - agent artifacts have a manifest
 * - tags are within count and length limits
 *
 * @throws ArtifactValidationFailedError with all validation errors collected
 */
export function validateCreateParams(params: CreateArtifactParams): void {
  const errors: string[] = [];

  if (!params.name || params.name.trim().length === 0) {
    errors.push("name must be a non-empty string");
  } else if (params.name.length > MAX_NAME_LENGTH) {
    errors.push(`name must be at most ${MAX_NAME_LENGTH} characters`);
  }

  if (!params.description || params.description.trim().length === 0) {
    errors.push("description must be a non-empty string");
  }

  const artifactType = params.type;
  if (artifactType === "tool") {
    if (!("schema" in params && params.schema)) {
      errors.push("tool artifacts must include a schema");
    }
  } else if (artifactType === "agent") {
    if (!("manifest" in params && params.manifest)) {
      errors.push("agent artifacts must include a manifest");
    }
  } else {
    errors.push(`type must be "tool" or "agent", got "${String(artifactType as string)}"`);
  }

  validateTags(params.tags, errors);

  if (errors.length > 0) {
    throw new ArtifactValidationFailedError(errors);
  }
}

/**
 * Validate parameters for updating an artifact.
 *
 * Only validates fields that are present (partial update).
 *
 * @throws ArtifactValidationFailedError with all validation errors collected
 */
export function validateUpdateParams(params: UpdateArtifactParams): void {
  const errors: string[] = [];

  if (params.name !== undefined && params.name.trim().length === 0) {
    errors.push("name must be a non-empty string");
  } else if (params.name !== undefined && params.name.length > MAX_NAME_LENGTH) {
    errors.push(`name must be at most ${MAX_NAME_LENGTH} characters`);
  }

  if (params.description !== undefined && params.description.trim().length === 0) {
    errors.push("description must be a non-empty string");
  }

  if (params.expectedVersion !== undefined && params.expectedVersion < 1) {
    errors.push("expectedVersion must be at least 1");
  }

  if (params.status !== undefined) {
    const validStatuses = ["active", "inactive", "deprecated"] as const;
    if (!validStatuses.includes(params.status as (typeof validStatuses)[number])) {
      errors.push(`status must be one of: ${validStatuses.join(", ")}`);
    }
  }

  validateTags(params.tags, errors);

  if (errors.length > 0) {
    throw new ArtifactValidationFailedError(errors);
  }
}

/**
 * Validate tags array (shared between create and update).
 */
function validateTags(tags: readonly string[] | undefined, errors: string[]): void {
  if (tags === undefined) return;

  if (tags.length > MAX_TAGS) {
    errors.push(`maximum ${MAX_TAGS} tags allowed, got ${tags.length}`);
  }

  for (const tag of tags) {
    if (tag.trim().length === 0) {
      errors.push("tags must be non-empty strings");
      break;
    }
    if (tag.length > MAX_TAG_LENGTH) {
      errors.push(`tag length must be at most ${MAX_TAG_LENGTH} characters`);
      break;
    }
  }
}
