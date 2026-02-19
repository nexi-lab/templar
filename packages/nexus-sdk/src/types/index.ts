/**
 * Common types and interfaces for @nexus/sdk
 */

/**
 * Configuration options for NexusClient
 */
export interface ClientConfig {
  /**
   * API key for authentication
   */
  apiKey?: string;

  /**
   * Base URL for the Nexus API
   * @default "https://api.nexus.dev"
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Retry configuration
   */
  retry?: RetryOptions;

  /**
   * Custom headers to include with every request
   */
  headers?: Record<string, string>;
}

/**
 * Retry options for failed requests
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Maximum delay in milliseconds between retries
   * @default 10000
   */
  maxDelay?: number;

  /**
   * Backoff multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * HTTP status codes that should trigger a retry
   * @default [408, 429, 500, 502, 503, 504]
   */
  retryableStatusCodes?: number[];
}

/**
 * HTTP request options
 */
export interface RequestOptions {
  /**
   * HTTP method
   */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

  /**
   * Request body (will be JSON serialized)
   */
  body?: unknown;

  /**
   * Additional headers for this request
   */
  headers?: Record<string, string>;

  /**
   * Query parameters
   */
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * API error response
 */
export interface ErrorResponse {
  /**
   * Error code
   */
  code: string;

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Additional error details
   */
  details?: Record<string, unknown>;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  /**
   * Number of items per page
   * @default 50
   */
  limit?: number;

  /**
   * Cursor for pagination
   */
  cursor?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  /**
   * Array of items
   */
  data: T[];

  /**
   * Next page cursor (if more results exist)
   */
  nextCursor?: string;

  /**
   * Whether there are more results
   */
  hasMore: boolean;
}

// Re-export ACE types
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
} from "./ace.js";
// Re-export pay types
export type {
  BalanceResponse,
  DebitParams,
  DebitResponse,
  TokenUsage,
  TransferParams,
  TransferPhase,
  TransferResponse,
  TransferStatus,
} from "./pay.js";
