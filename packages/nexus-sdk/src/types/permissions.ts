/**
 * Permissions API types — ReBAC permission checks and namespace tool visibility
 *
 * Supports:
 * - Permission checks against Nexus ReBAC
 * - Permission grants for progressive allowlisting
 * - Namespace-scoped tool visibility queries
 */

// ============================================================================
// REQUEST PARAMS
// ============================================================================

/**
 * Parameters for checking a permission via ReBAC.
 */
export interface CheckPermissionParams {
  /** Subject identifier (e.g., agent or session ID) */
  subject: string;

  /** Action to check (e.g., "execute") */
  action: string;

  /** Resource identifier (e.g., tool name) */
  resource: string;

  /** Optional namespace scope */
  namespace?: string;
}

/**
 * Parameters for granting a permission.
 */
export interface GrantPermissionParams {
  /** Subject to grant permission to */
  subject: string;

  /** Action to grant (e.g., "execute") */
  action: string;

  /** Resource to grant access to (e.g., tool name) */
  resource: string;

  /** Optional namespace scope */
  namespace?: string;

  /** Optional TTL in seconds (0 = permanent) */
  ttl_seconds?: number;
}

/**
 * Parameters for listing namespace-visible tools.
 */
export interface ListNamespaceToolsParams {
  /** Namespace to query */
  namespace: string;

  /** Optional subject filter */
  subject?: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Permission check response.
 */
export interface CheckPermissionResponse {
  /** Whether the permission is allowed */
  allowed: boolean;

  /** Human-readable reason (present on deny) */
  reason?: string;
}

/**
 * Permission grant response.
 */
export interface GrantPermissionResponse {
  /** Whether the grant was successful */
  granted: boolean;

  /** Unique permission identifier */
  permission_id: string;
}

/**
 * Namespace tools query response.
 */
export interface ListNamespaceToolsResponse {
  /** List of tool names visible in the namespace */
  tools: string[];
}
