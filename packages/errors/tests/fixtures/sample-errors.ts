/**
 * Sample errors for testing
 */

import {
  InternalError,
  NotFoundError,
  ValidationError,
  AgentNotFoundError,
  AgentExecutionError,
  TokenExpiredError,
  QuotaExceededError,
  WorkflowStepError,
} from "../../src/index.js";

export const sampleErrors = {
  internal: new InternalError("Internal server error", { component: "database" }, "trace-001"),

  notFound: new NotFoundError("User", "user-123", { action: "fetch" }, "trace-002"),

  validation: new ValidationError(
    "Validation failed for user input",
    [
      { field: "email", message: "Invalid email format", code: "invalid_format" },
      { field: "age", message: "Must be at least 18", code: "out_of_range", value: 15 },
      { field: "password", message: "Password required", code: "required" },
    ],
    { userId: "user-456" },
    "trace-003"
  ),

  agentNotFound: new AgentNotFoundError("deep-research-agent", { version: "v1.2" }, "trace-004"),

  agentExecution: new AgentExecutionError(
    "sentiment-analyzer",
    "Model inference failed",
    new Error("CUDA out of memory"),
    { gpu: "0", batchSize: "32" },
    "trace-005"
  ),

  tokenExpired: new TokenExpiredError(
    "JWT token expired",
    { userId: "user-789", issuedAt: "2026-01-01" },
    "trace-006"
  ),

  quotaExceeded: new QuotaExceededError(
    "API requests",
    1000,
    1050,
    { plan: "free", userId: "user-999" },
    "trace-007"
  ),

  workflowStep: new WorkflowStepError(
    "data-pipeline-workflow",
    "transform-step",
    "Transformation failed due to invalid schema",
    new Error("Schema validation failed"),
    { inputRows: "1000", failedRows: "42" },
    "trace-008"
  ),
};

export const sampleWireFormats = {
  rfc9457: {
    type: "/errors/AgentNotFoundError",
    title: "Agent not found",
    status: 404,
    detail: "Agent 'test-agent' not found",
    code: "AGENT_NOT_FOUND",
    domain: "agent",
    traceId: "trace-123",
    timestamp: "2026-02-09T12:00:00Z",
    metadata: {
      agentId: "test-agent",
      version: "v1.0",
    },
  },

  grpc: {
    code: 5, // NOT_FOUND
    message: "Workflow 'test-workflow' not found",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "WORKFLOW_NOT_FOUND",
        domain: "workflow.templar.com",
        metadata: {
          workflowId: "test-workflow",
          traceId: "trace-456",
          timestamp: "2026-02-09T12:00:00Z",
        },
      },
    ],
  },

  websocket: {
    type: "error" as const,
    requestId: "req-789",
    error: {
      type: "/errors/RateLimitExceededError",
      title: "Rate limit exceeded",
      status: 429,
      detail: "Rate limit exceeded. Retry after 60 seconds.",
      code: "RATE_LIMIT_EXCEEDED",
      domain: "quota",
      timestamp: "2026-02-09T12:00:00Z",
    },
    timestamp: "2026-02-09T12:00:00Z",
  },
};
