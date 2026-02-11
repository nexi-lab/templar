/**
 * Permissions resource for ReBAC permission checks and namespace tool visibility
 */

import type {
  CheckPermissionParams,
  CheckPermissionResponse,
  GrantPermissionParams,
  GrantPermissionResponse,
  ListNamespaceToolsParams,
  ListNamespaceToolsResponse,
} from "../types/permissions.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing permissions via the Nexus ReBAC API
 *
 * Supports:
 * - Permission checks (does subject have action on resource?)
 * - Permission grants (progressive allowlisting)
 * - Namespace tool visibility queries
 *
 * @example
 * ```typescript
 * const { allowed } = await client.permissions.checkPermission({
 *   subject: 'session-123',
 *   action: 'execute',
 *   resource: 'web-search',
 * });
 * ```
 */
export class PermissionsResource extends BaseResource {
  /**
   * Check whether a subject has permission to perform an action on a resource.
   *
   * @param params - Permission check parameters
   * @returns Whether the permission is allowed and an optional reason
   *
   * @example
   * ```typescript
   * const result = await client.permissions.checkPermission({
   *   subject: 'session-123',
   *   action: 'execute',
   *   resource: 'web-search',
   * });
   * if (!result.allowed) {
   *   console.log(`Denied: ${result.reason}`);
   * }
   * ```
   */
  async checkPermission(params: CheckPermissionParams): Promise<CheckPermissionResponse> {
    return this.http.request<CheckPermissionResponse>("/api/nfs/check_permission", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Grant a permission for progressive allowlisting.
   *
   * @param params - Grant parameters including subject, action, resource
   * @returns Grant result with permission ID
   *
   * @example
   * ```typescript
   * const result = await client.permissions.grantPermission({
   *   subject: 'session-123',
   *   action: 'execute',
   *   resource: 'web-search',
   * });
   * console.log(`Granted: ${result.permission_id}`);
   * ```
   */
  async grantPermission(params: GrantPermissionParams): Promise<GrantPermissionResponse> {
    return this.http.request<GrantPermissionResponse>("/api/v2/permissions/grant", {
      method: "POST",
      body: params,
    });
  }

  /**
   * List tools visible in a namespace.
   *
   * @param params - Namespace query parameters
   * @returns List of tool names visible in the namespace
   *
   * @example
   * ```typescript
   * const { tools } = await client.permissions.listNamespaceTools({
   *   namespace: 'production',
   * });
   * console.log(`Visible tools: ${tools.join(', ')}`);
   * ```
   */
  async listNamespaceTools(params: ListNamespaceToolsParams): Promise<ListNamespaceToolsResponse> {
    return this.http.request<ListNamespaceToolsResponse>(
      `/api/v2/permissions/namespace/${encodeURIComponent(params.namespace)}/tools`,
      {
        method: "GET",
        ...(params.subject !== undefined ? { query: { subject: params.subject } } : {}),
      },
    );
  }
}
