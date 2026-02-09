/**
 * Types for tool resources
 */

import type { PaginatedResponse, PaginationParams } from "./index.js";

/**
 * Tool status
 */
export type ToolStatus = "active" | "inactive" | "deprecated";

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  /**
   * Parameter name
   */
  name: string;

  /**
   * Parameter type (e.g., "string", "number", "boolean")
   */
  type: string;

  /**
   * Parameter description
   */
  description: string;

  /**
   * Whether the parameter is required
   */
  required: boolean;

  /**
   * Default value
   */
  default?: unknown;
}

/**
 * Tool representation
 */
export interface Tool {
  /**
   * Unique tool identifier
   */
  id: string;

  /**
   * Tool name
   */
  name: string;

  /**
   * Tool description
   */
  description: string;

  /**
   * Tool status
   */
  status: ToolStatus;

  /**
   * Tool parameters
   */
  parameters: ToolParameter[];

  /**
   * Tool configuration
   */
  config?: Record<string, unknown>;

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;

  /**
   * Creation timestamp
   */
  createdAt: string;

  /**
   * Last update timestamp
   */
  updatedAt: string;
}

/**
 * Parameters for creating a tool
 */
export interface CreateToolParams {
  /**
   * Tool name
   */
  name: string;

  /**
   * Tool description
   */
  description: string;

  /**
   * Tool parameters
   */
  parameters: ToolParameter[];

  /**
   * Tool configuration
   */
  config?: Record<string, unknown>;

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for updating a tool
 */
export interface UpdateToolParams {
  /**
   * Tool name
   */
  name?: string;

  /**
   * Tool description
   */
  description?: string;

  /**
   * Tool status
   */
  status?: ToolStatus;

  /**
   * Tool parameters
   */
  parameters?: ToolParameter[];

  /**
   * Tool configuration
   */
  config?: Record<string, unknown>;

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for listing tools
 */
export interface ListToolsParams extends PaginationParams {
  /**
   * Filter by status
   */
  status?: ToolStatus;

  /**
   * Search query for name or description
   */
  query?: string;
}

/**
 * Paginated tools response
 */
export type ToolsResponse = PaginatedResponse<Tool>;
