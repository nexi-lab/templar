/**
 * Zone ID validation.
 *
 * Zone IDs must match: [a-z0-9][a-z0-9-]{1,61}[a-z0-9]
 * (3-63 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens)
 */

import { FederationZoneInvalidIdError } from "@templar/errors";

/** Zone ID regex: 3-63 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens. */
const ZONE_ID_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/**
 * Validate a zone ID string.
 *
 * @throws {FederationZoneInvalidIdError} if the ID is invalid.
 */
export function validateZoneId(zoneId: string): void {
  if (zoneId.length < 3) {
    throw new FederationZoneInvalidIdError(zoneId, "must be at least 3 characters");
  }
  if (zoneId.length > 63) {
    throw new FederationZoneInvalidIdError(zoneId, "must be at most 63 characters");
  }
  if (!ZONE_ID_REGEX.test(zoneId)) {
    throw new FederationZoneInvalidIdError(
      zoneId,
      "must match [a-z0-9][a-z0-9-]{1,61}[a-z0-9] (lowercase alphanumeric + hyphens, no leading/trailing hyphens)",
    );
  }
}
