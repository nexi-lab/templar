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
export { AceResource } from "./resources/ace/index.js";
export { AgentsResource } from "./resources/agents.js";
export { ArtifactsResource } from "./resources/artifacts.js";
export { BaseResource } from "./resources/base.js";
export { ChannelsResource } from "./resources/channels.js";
export { EventLogResource } from "./resources/eventlog.js";
export { MemoryResource } from "./resources/memory.js";
export { PairingResource } from "./resources/pairing.js";
export { PayResource } from "./resources/pay.js";
export { PermissionsResource } from "./resources/permissions.js";
export { SandboxResource } from "./resources/sandbox.js";
export { SecretsAuditResource } from "./resources/secrets-audit.js";
export { ToolsResource } from "./resources/tools.js";
// ACE types
export type {
  AddFeedbackParams,
  AddFeedbackResponse,
  CompleteTrajectoryParams,
  ConsolidateParams,
  ConsolidationResult,
  CreatePlaybookParams,
  CreatePlaybookResponse,
  CurateBulkParams,
  CurateParams,
  CurationResult,
  EffectiveScoreParams,
  EffectiveScoreResponse,
  FeedbackEntry,
  FeedbackType,
  LogStepParams,
  PlaybookEntry,
  PlaybookScope,
  PlaybookStrategy,
  PlaybookUsageParams,
  PlaybookVisibility,
  QueryPlaybooksParams,
  QueryPlaybooksResponse,
  QueryTrajectoriesParams,
  QueryTrajectoriesResponse,
  ReflectionResult,
  ReflectParams,
  RelearnParams,
  ScoreStrategy,
  StartTrajectoryParams,
  StartTrajectoryResponse,
  TrajectoryEntry,
  TrajectoryFeedbackResponse,
  TrajectoryStatus,
  TrajectoryStep,
  TrajectoryStepType,
  UpdatePlaybookParams,
} from "./types/ace.js";
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
  AgentArtifact,
  Artifact,
  ArtifactBase,
  ArtifactMetadata,
  ArtifactSearchResponse,
  ArtifactSearchResult,
  ArtifactStatus,
  ArtifactsBatchResponse,
  ArtifactsResponse,
  ArtifactType,
  CreateAgentArtifactParams,
  CreateArtifactParams,
  CreateToolArtifactParams,
  GetArtifactsBatchParams,
  ListArtifactsParams,
  SearchArtifactsParams,
  ToolArtifact,
  UpdateArtifactParams,
} from "./types/artifacts.js";
export type {
  Channel,
  ChannelStatus,
  ChannelsResponse,
  ChannelType,
  CreateChannelParams,
  ListChannelsParams,
  UpdateChannelParams,
} from "./types/channels.js";
export type {
  EventLogBatchWriteParams,
  EventLogBatchWriteResponse,
  EventLogWriteParams,
  EventLogWriteResponse,
} from "./types/eventlog.js";
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
  AddPeerParams,
  ListPeersParams,
  PeerEntry,
  PeersPage,
  RemovePeerParams,
} from "./types/pairing.js";
export type {
  BalanceResponse,
  DebitParams,
  DebitResponse,
  TokenUsage,
  TransferParams,
  TransferPhase,
  TransferResponse,
  TransferStatus,
} from "./types/pay.js";
export type {
  CheckPermissionParams,
  CheckPermissionResponse,
  GrantPermissionParams,
  GrantPermissionResponse,
  ListNamespaceToolsParams,
  ListNamespaceToolsResponse,
} from "./types/permissions.js";
export type {
  CreateSandboxParams,
  CreateSandboxResponse,
  RunCodeParams,
  RunCodeResponse,
  SandboxInfoResponse,
} from "./types/sandbox.js";
export type {
  ExportSecretsAuditParams,
  ListSecretsAuditParams,
  SecretsAuditEvent,
  SecretsAuditEventListResponse,
  SecretsAuditEventType,
  SecretsAuditExportFormat,
  SecretsAuditExportResponse,
  SecretsAuditIntegrityResponse,
} from "./types/secrets-audit.js";
export type {
  CreateToolParams,
  ListToolsParams,
  Tool,
  ToolParameter,
  ToolStatus,
  ToolsResponse,
  UpdateToolParams,
} from "./types/tools.js";
