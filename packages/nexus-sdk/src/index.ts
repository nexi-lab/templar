/**
 * @nexus/sdk - Hand-written TypeScript client for Nexus API
 *
 * @example
 * ```typescript
 * import { NexusClient } from '@nexus/sdk';
 *
 * const client = new NexusClient({
 *   apiKey: process.env.NEXUS_API_KEY,
 * });
 *
 * const agent = await client.agents.create({
 *   name: 'my-agent',
 * });
 * ```
 */

// Main client
export { NexusClient } from "./client.js";
// Errors
export {
  NexusAPIError,
  NexusNetworkError,
  NexusTimeoutError,
  NexusValidationError,
} from "./errors.js";
// HTTP client
export { HttpClient } from "./http/index.js";
// Resources
export { AgentsResource } from "./resources/agents.js";
export { BaseResource } from "./resources/base.js";
export { ChannelsResource } from "./resources/channels.js";
export { MemoryResource } from "./resources/memory.js";
export { ToolsResource } from "./resources/tools.js";
export type {
  Agent,
  AgentModel,
  AgentStatus,
  AgentsResponse,
  AgentTool,
  CreateAgentParams,
  ListAgentsParams,
  UpdateAgentParams,
} from "./types/agents.js";
export type {
  Channel,
  ChannelStatus,
  ChannelsResponse,
  ChannelType,
  CreateChannelParams,
  ListChannelsParams,
  UpdateChannelParams,
} from "./types/channels.js";
// Re-export all types
export type {
  ClientConfig,
  ErrorResponse,
  PaginatedResponse,
  PaginationParams,
  RequestOptions,
  RetryOptions,
} from "./types/index.js";
export type {
  BatchStoreError,
  BatchStoreMemoriesParams,
  BatchStoreMemoriesResponse,
  DeleteMemoryParams,
  DeleteMemoryResponse,
  GetMemoryParams,
  MemoryEntry,
  MemoryScope,
  MemoryState,
  MemoryStoreResponse,
  MemoryVersion,
  MemoryWithHistory,
  QueryMemoriesParams,
  QueryMemoriesResponse,
  SearchMemoriesParams,
  SearchMemoriesResponse,
  SearchMode,
  StoreMemoryParams,
} from "./types/memory.js";
export type {
  CreateToolParams,
  ListToolsParams,
  Tool,
  ToolParameter,
  ToolStatus,
  ToolsResponse,
  UpdateToolParams,
} from "./types/tools.js";
