/**
 * Types for agent resources
 */

import type { PaginatedResponse, PaginationParams } from "./index.js";

/**
 * Agent status
 */
export type AgentStatus = "active" | "inactive" | "error";

/**
 * Agent model configuration
 */
export interface AgentModel {
  /**
   * Model provider (e.g., "openai", "anthropic")
   */
  provider: string;

  /**
   * Model name (e.g., "gpt-4", "claude-3-opus")
   */
  name: string;

  /**
   * Sampling temperature (0-2)
   */
  temperature?: number;

  /**
   * Maximum tokens to generate
   */
  maxTokens?: number;
}

/**
 * Agent tool configuration
 */
export interface AgentTool {
  /**
   * Tool name
   */
  name: string;

  /**
   * Tool description
   */
  description: string;

  /**
   * Tool configuration
   */
  config?: Record<string, unknown>;
}

/**
 * Agent representation
 */
export interface Agent {
  /**
   * Unique agent identifier
   */
  id: string;

  /**
   * Agent name
   */
  name: string;

  /**
   * Agent description
   */
  description?: string;

  /**
   * Agent status
   */
  status: AgentStatus;

  /**
   * Model configuration
   */
  model?: AgentModel;

  /**
   * System prompt
   */
  systemPrompt?: string;

  /**
   * Tools available to the agent
   */
  tools?: AgentTool[];

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
 * Parameters for creating an agent
 */
export interface CreateAgentParams {
  /**
   * Agent name
   */
  name: string;

  /**
   * Agent description
   */
  description?: string;

  /**
   * Model configuration
   */
  model?: AgentModel;

  /**
   * System prompt
   */
  systemPrompt?: string;

  /**
   * Tools to make available to the agent
   */
  tools?: AgentTool[];

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for updating an agent
 */
export interface UpdateAgentParams {
  /**
   * Agent name
   */
  name?: string;

  /**
   * Agent description
   */
  description?: string;

  /**
   * Agent status
   */
  status?: AgentStatus;

  /**
   * Model configuration
   */
  model?: AgentModel;

  /**
   * System prompt
   */
  systemPrompt?: string;

  /**
   * Tools available to the agent
   */
  tools?: AgentTool[];

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for listing agents
 */
export interface ListAgentsParams extends PaginationParams {
  /**
   * Filter by status
   */
  status?: AgentStatus;

  /**
   * Search query for name or description
   */
  query?: string;
}

/**
 * Paginated agents response
 */
export type AgentsResponse = PaginatedResponse<Agent>;
