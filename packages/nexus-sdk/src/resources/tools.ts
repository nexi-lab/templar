/**
 * Tools resource for managing agent tools
 */

import type {
  CreateToolParams,
  ListToolsParams,
  Tool,
  ToolsResponse,
  UpdateToolParams,
} from "../types/tools.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing tools
 */
export class ToolsResource extends BaseResource {
  /**
   * Create a new tool
   *
   * @param params - Tool creation parameters
   * @returns The created tool
   *
   * @example
   * ```typescript
   * const tool = await client.tools.create({
   *   name: 'search',
   *   description: 'Search the web',
   *   parameters: [
   *     {
   *       name: 'query',
   *       type: 'string',
   *       description: 'Search query',
   *       required: true,
   *     },
   *   ],
   * });
   * ```
   */
  async create(params: CreateToolParams): Promise<Tool> {
    return this.http.request<Tool>("/tools", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Get a tool by ID
   *
   * @param id - Tool ID
   * @returns The tool
   *
   * @example
   * ```typescript
   * const tool = await client.tools.get('tool-123');
   * ```
   */
  async get(id: string): Promise<Tool> {
    return this.http.request<Tool>(`/tools/${id}`, {
      method: "GET",
    });
  }

  /**
   * Update a tool
   *
   * @param id - Tool ID
   * @param params - Tool update parameters
   * @returns The updated tool
   *
   * @example
   * ```typescript
   * const tool = await client.tools.update('tool-123', {
   *   status: 'deprecated',
   * });
   * ```
   */
  async update(id: string, params: UpdateToolParams): Promise<Tool> {
    return this.http.request<Tool>(`/tools/${id}`, {
      method: "PATCH",
      body: params,
    });
  }

  /**
   * Delete a tool
   *
   * @param id - Tool ID
   *
   * @example
   * ```typescript
   * await client.tools.delete('tool-123');
   * ```
   */
  async delete(id: string): Promise<void> {
    return this.http.request<void>(`/tools/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * List tools with optional filtering and pagination
   *
   * @param params - List parameters
   * @returns Paginated list of tools
   *
   * @example
   * ```typescript
   * const response = await client.tools.list({
   *   status: 'active',
   *   limit: 50,
   * });
   * console.log(response.data); // Array of tools
   * console.log(response.hasMore); // Whether there are more results
   * ```
   */
  async list(params?: ListToolsParams): Promise<ToolsResponse> {
    return this.http.request<ToolsResponse>("/tools", {
      method: "GET",
      query: params as Record<string, string | number | boolean | undefined>,
    });
  }
}
