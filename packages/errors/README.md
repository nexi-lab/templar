# @templar/errors

Shared error taxonomy for the Templar AI Agent Execution Engine.

## Features

- 🏷️ **Type-safe errors** with `_tag` discriminants for exhaustive pattern matching
- 📖 **Single source of truth** - centralized error catalog with HTTP/gRPC mappings
- 🔄 **Wire format support** - RFC 9457 (REST), gRPC (AIP-193), WebSocket
- ✅ **Runtime validation** - Zod schemas for safe deserialization
- 🎯 **Domain organization** - errors grouped by domain (auth, agent, workflow, etc.)
- 📊 **Rich metadata** - attach context, trace IDs, and custom metadata
- 🧪 **Comprehensive tests** - 100% coverage of core functionality

## Installation

```bash
pnpm add @templar/errors
```

## Quick Start

### Basic Usage

```typescript
import { AgentNotFoundError, ValidationError } from "@templar/errors";

// Throw a domain-specific error
throw new AgentNotFoundError("agent-123");

// Create validation error with issues
throw new ValidationError("Invalid input", [
  { field: "email", message: "Invalid format", code: "invalid_format" },
]);
```

### With Metadata and Trace IDs

```typescript
import { AgentExecutionError } from "@templar/errors";

throw new AgentExecutionError(
  "sentiment-analyzer",
  "Model inference failed",
  cause, // optional underlying error
  { gpu: "0", batchSize: "32" }, // metadata
  "trace-abc-123" // trace ID for distributed tracing
);
```

### Error Handling with Exhaustive Pattern Matching

```typescript
import { TemplarError, isTemplarError } from "@templar/errors";

function handleError(error: TemplarError): Response {
  // Exhaustive switch on _tag discriminant
  switch (error._tag) {
    case "AgentNotFoundError":
      return { status: 404, message: `Agent ${error.agentId} not found` };

    case "ValidationError":
      return {
        status: 400,
        message: "Validation failed",
        issues: error.issues,
      };

    case "TokenExpiredError":
      return { status: 401, message: "Please re-authenticate" };

    // ... handle other cases

    default:
      // TypeScript will error if you miss a case
      const _exhaustive: never = error;
      return { status: 500, message: "Internal error" };
  }
}
```

## Error Catalog

All errors are defined in the central catalog with consistent HTTP/gRPC mappings:

| Domain | Error Code | HTTP | gRPC |
|--------|------------|------|------|
| **Internal** | `INTERNAL_ERROR` | 500 | INTERNAL |
| | `INTERNAL_TIMEOUT` | 504 | DEADLINE_EXCEEDED |
| **Auth** | `AUTH_TOKEN_EXPIRED` | 401 | UNAUTHENTICATED |
| | `AUTH_INSUFFICIENT_SCOPE` | 403 | PERMISSION_DENIED |
| **Agent** | `AGENT_NOT_FOUND` | 404 | NOT_FOUND |
| | `AGENT_EXECUTION_FAILED` | 500 | INTERNAL |
| | `AGENT_EXECUTION_TIMEOUT` | 504 | DEADLINE_EXCEEDED |
| **Workflow** | `WORKFLOW_NOT_FOUND` | 404 | NOT_FOUND |
| | `WORKFLOW_INVALID_STATE` | 409 | FAILED_PRECONDITION |
| **Validation** | `VALIDATION_FAILED` | 400 | INVALID_ARGUMENT |
| **Quota** | `QUOTA_EXCEEDED` | 429 | RESOURCE_EXHAUSTED |
| | `RATE_LIMIT_EXCEEDED` | 429 | RESOURCE_EXHAUSTED |

[See full catalog in src/catalog.ts](./src/catalog.ts)

## Wire Format Serialization

### RFC 9457 (REST/HTTP)

Standard Problem Details format for HTTP APIs:

```typescript
import { serializeToRFC9457, deserializeFromRFC9457 } from "@templar/errors";

// Serialize error for HTTP response
const error = new AgentNotFoundError("agent-123");
const problemDetails = serializeToRFC9457(error);

// Returns:
// {
//   type: "/errors/AgentNotFoundError",
//   title: "Agent not found",
//   status: 404,
//   detail: "Agent 'agent-123' not found",
//   code: "AGENT_NOT_FOUND",
//   domain: "agent",
//   timestamp: "2026-02-09T12:00:00Z",
//   traceId: "...",
// }

// Deserialize from HTTP response
const error = deserializeFromRFC9457(problemDetails);
```

### gRPC (AIP-193)

Google's canonical error model for gRPC:

```typescript
import { serializeToGrpc, deserializeFromGrpc } from "@templar/errors";

const error = new WorkflowNotFoundError("workflow-abc");
const grpcStatus = serializeToGrpc(error);

// Returns:
// {
//   code: 5, // NOT_FOUND
//   message: "Workflow 'workflow-abc' not found",
//   details: [{
//     "@type": "type.googleapis.com/google.rpc.ErrorInfo",
//     reason: "WORKFLOW_NOT_FOUND",
//     domain: "workflow.templar.com",
//     metadata: { workflowId: "workflow-abc", ... }
//   }]
// }

const error = deserializeFromGrpc(grpcStatus);
```

### WebSocket

Error envelope for WebSocket messages:

```typescript
import { serializeToWebSocket, deserializeFromWebSocket } from "@templar/errors";

const error = new QuotaExceededError("API calls", 1000, 1050);
const wsMessage = serializeToWebSocket(error, "request-123");

// Returns:
// {
//   type: "error",
//   requestId: "request-123",
//   error: { ... RFC 9457 format ... },
//   timestamp: "2026-02-09T12:00:00Z"
// }

const error = deserializeFromWebSocket(wsMessage);
```

## Runtime Validation

All wire formats are validated with Zod schemas:

```typescript
import { ProblemDetailsSchema, GrpcStatusSchema } from "@templar/errors";

// Validate incoming error payload
const result = ProblemDetailsSchema.safeParse(unknownData);

if (result.success) {
  const validated = result.data;
  // Safe to use
} else {
  console.error("Invalid error format:", result.error);
}
```

## Error Catalog Utilities

```typescript
import {
  getAllErrorCodes,
  getErrorCodesByDomain,
  getCatalogEntry,
  isValidErrorCode,
  validateCatalog,
} from "@templar/errors";

// Get all error codes
const allCodes = getAllErrorCodes();
// ["INTERNAL_ERROR", "AGENT_NOT_FOUND", ...]

// Get codes for specific domain
const agentCodes = getErrorCodesByDomain("agent");
// ["AGENT_NOT_FOUND", "AGENT_EXECUTION_FAILED", ...]

// Look up catalog entry
const entry = getCatalogEntry("AGENT_NOT_FOUND");
// { domain: "agent", httpStatus: 404, grpcCode: "NOT_FOUND", ... }

// Validate error code
if (isValidErrorCode("AGENT_NOT_FOUND")) {
  // Code exists in catalog
}

// Validate entire catalog (useful in tests)
const { valid, errors } = validateCatalog();
```

## Type Guards

```typescript
import { isTemplarError, isError } from "@templar/errors";

try {
  // ...
} catch (err) {
  if (isTemplarError(err)) {
    // err is TemplarError - access code, domain, etc.
    console.log(`Error code: ${err.code}`);
  } else if (isError(err)) {
    // err is Error - but not TemplarError
    console.log(err.message);
  } else {
    // Unknown error type
    console.log("Unknown error:", err);
  }
}
```

## Wrapping Unknown Errors

```typescript
import { wrapError, serializeError } from "@templar/errors";

try {
  // Some code that might throw unknown errors
  JSON.parse(invalidJson);
} catch (err) {
  // Wrap any error into a TemplarError
  const templarError = wrapError(err, "trace-123");
  // Always returns InternalError for unknown errors

  // Or serialize directly
  const problemDetails = serializeError(err, "trace-123");
}
```

## Error Classes

### Internal Errors
- `InternalError` - Generic internal server error
- `NotImplementedError` - Feature not implemented
- `ServiceUnavailableError` - Service temporarily unavailable
- `TimeoutError` - Operation timeout

### Auth Errors
- `TokenExpiredError` - Authentication token expired
- `TokenInvalidError` - Invalid token format
- `TokenMissingError` - Token not provided
- `InsufficientScopeError` - Missing required permissions
- `ForbiddenError` - Access forbidden

### Resource Errors
- `NotFoundError` - Resource not found
- `AlreadyExistsError` - Resource already exists
- `ResourceConflictError` - Resource state conflict
- `ResourceGoneError` - Resource permanently deleted

### Validation Errors
- `ValidationError` - Input validation failed (with issues array)
- `RequiredFieldError` - Required field missing
- `InvalidFormatError` - Invalid input format
- `OutOfRangeError` - Value out of acceptable range

### Agent Errors
- `AgentNotFoundError` - Agent doesn't exist
- `AgentExecutionError` - Agent execution failed
- `AgentTimeoutError` - Agent execution timeout
- `AgentInvalidStateError` - Agent in invalid state
- `AgentConfigurationError` - Invalid agent configuration

### Workflow Errors
- `WorkflowNotFoundError` - Workflow doesn't exist
- `WorkflowExecutionError` - Workflow execution failed
- `WorkflowInvalidStateError` - Workflow in invalid state
- `WorkflowStepError` - Workflow step failed

### Deployment Errors
- `DeploymentError` - Deployment failed
- `DeploymentNotFoundError` - Deployment doesn't exist
- `DeploymentConfigError` - Invalid deployment config

### Quota/Rate Limit Errors
- `QuotaExceededError` - Resource quota exceeded
- `RateLimitExceededError` - Rate limit exceeded
- `PayloadTooLargeError` - Request payload too large

## Architecture

```
@templar/errors
├── src/
│   ├── base.ts           # TemplarError base class
│   ├── catalog.ts        # ERROR_CATALOG (single source of truth)
│   ├── classes.ts        # Concrete error classes
│   ├── utils.ts          # Helper functions
│   ├── serialization.ts  # Wire format conversion
│   ├── wire/
│   │   ├── rfc9457.ts    # RFC 9457 ProblemDetails
│   │   ├── grpc.ts       # gRPC Status (AIP-193)
│   │   └── websocket.ts  # WebSocket error envelope
│   └── index.ts          # Public API
└── tests/
    ├── unit/             # Error classes & catalog tests
    ├── integration/      # Serialization round-trip tests
    └── fixtures/         # Sample errors for testing
```

## Design Principles

1. **DRY** - Error catalog is the single source of truth for codes, HTTP status, and gRPC mappings
2. **Type Safety** - `_tag` discriminants enable exhaustive pattern matching
3. **Edge Case Handling** - Runtime validation with Zod catches malformed wire formats
4. **Explicit over Clever** - Clear error class hierarchy, no magic
5. **Well-Tested** - Comprehensive unit and integration tests

## Best Practices

### DO ✅

- Use domain-specific error classes (`AgentNotFoundError`, not generic `NotFoundError`)
- Include metadata for debugging (`{ userId, agentId, attemptCount }`)
- Pass trace IDs for distributed tracing
- Use exhaustive switch on `_tag` for error handling
- Validate wire format with Zod before deserializing

### DON'T ❌

- Create new error classes outside the shared package
- Use string error codes directly - import from catalog
- Skip metadata when it would help debugging
- Ignore trace IDs in distributed systems
- Trust wire format without validation

## Contributing

To add a new error:

1. Add entry to `ERROR_CATALOG` in `src/catalog.ts`
2. Create error class in `src/classes.ts`
3. Export from `src/index.ts`
4. Add serialization logic if needed in `src/serialization.ts`
5. Write tests in `tests/unit/error-classes.test.ts`
6. Update this README

## License

MIT © Nexi Lab
