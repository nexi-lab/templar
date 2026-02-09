# @nexus/sdk

Hand-written TypeScript client for the Nexus API.

## Features

- ✅ **Type-safe** - Full TypeScript support with comprehensive type definitions
- ✅ **Tree-shakeable** - ESM-first with granular exports, <8KB gzipped
- ✅ **Zero dependencies** - Uses native `fetch()`, no axios or node-fetch
- ✅ **Automatic retries** - Configurable retry logic with exponential backoff
- ✅ **Timeout handling** - Request timeouts with configurable duration
- ✅ **Error handling** - Typed errors with proper error cause chaining
- ✅ **Fluent API** - Builder methods for configuration

## Installation

```bash
pnpm add @nexus/sdk
```

## Quick Start

```typescript
import { NexusClient } from '@nexus/sdk';

// Create a client
const client = new NexusClient({
  apiKey: process.env.NEXUS_API_KEY,
});

// Create an agent
const agent = await client.agents.create({
  name: 'my-agent',
  model: {
    provider: 'openai',
    name: 'gpt-4',
  },
});

// List tools
const tools = await client.tools.list({
  status: 'active',
  limit: 50,
});

// Create a channel
const channel = await client.channels.create({
  name: 'slack-notifications',
  type: 'slack',
  config: {
    token: process.env.SLACK_TOKEN,
    channelId: 'C123456',
  },
});
```

## API Reference

### NexusClient

Main client class providing access to all API resources.

#### Constructor

```typescript
const client = new NexusClient({
  apiKey?: string;          // API key for authentication
  baseUrl?: string;         // Base URL (default: https://api.nexus.dev)
  timeout?: number;         // Request timeout in ms (default: 30000)
  retry?: RetryOptions;     // Retry configuration
  headers?: Record<string, string>; // Custom headers
});
```

#### Builder Methods

```typescript
// Update retry options
client.withRetry({
  maxAttempts: 5,
  initialDelay: 2000,
  maxDelay: 10000,
  backoffMultiplier: 2,
});

// Update timeout
client.withTimeout(60000); // 60 seconds

// Method chaining
const configured = client
  .withRetry({ maxAttempts: 5 })
  .withTimeout(60000);
```

### Resources

#### Agents

```typescript
// Create an agent
const agent = await client.agents.create({
  name: 'my-agent',
  description?: string;
  model?: AgentModel;
  systemPrompt?: string;
  tools?: AgentTool[];
  metadata?: Record<string, unknown>;
});

// Get an agent
const agent = await client.agents.get('agent-id');

// Update an agent
const updated = await client.agents.update('agent-id', {
  name?: string;
  status?: 'active' | 'inactive' | 'error';
  // ... other fields
});

// Delete an agent
await client.agents.delete('agent-id');

// List agents
const { data, hasMore, nextCursor } = await client.agents.list({
  status?: 'active' | 'inactive' | 'error';
  query?: string;
  limit?: number;
  cursor?: string;
});
```

#### Tools

```typescript
// Create a tool
const tool = await client.tools.create({
  name: 'search',
  description: 'Search the web',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query',
      required: true,
    },
  ],
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
});

// Get a tool
const tool = await client.tools.get('tool-id');

// Update a tool
const updated = await client.tools.update('tool-id', {
  status?: 'active' | 'inactive' | 'deprecated';
  // ... other fields
});

// Delete a tool
await client.tools.delete('tool-id');

// List tools
const { data, hasMore } = await client.tools.list({
  status?: 'active' | 'inactive' | 'deprecated';
  query?: string;
  limit?: number;
  cursor?: string;
});
```

#### Channels

```typescript
// Create a channel
const channel = await client.channels.create({
  name: 'my-channel',
  type: 'slack' | 'discord' | 'teams' | 'webhook' | 'custom';
  config: Record<string, unknown>;
  description?: string;
  metadata?: Record<string, unknown>;
});

// Get a channel
const channel = await client.channels.get('channel-id');

// Update a channel
const updated = await client.channels.update('channel-id', {
  status?: 'active' | 'inactive' | 'error';
  config?: Record<string, unknown>;
  // ... other fields
});

// Delete a channel
await client.channels.delete('channel-id');

// List channels
const { data, hasMore } = await client.channels.list({
  type?: 'slack' | 'discord' | ...;
  status?: 'active' | 'inactive' | 'error';
  query?: string;
  limit?: number;
  cursor?: string;
});
```

## Advanced Usage

### Granular Imports (Tree-Shaking)

Import only what you need for smaller bundle sizes:

```typescript
// Full client (~8KB gzipped)
import { NexusClient } from '@nexus/sdk';
const client = new NexusClient({ apiKey: 'xxx' });

// Granular imports (~3KB gzipped)
import { HttpClient } from '@nexus/sdk/http';
import { AgentsResource } from '@nexus/sdk/agents';

const http = new HttpClient({
  apiKey: 'xxx',
  baseUrl: 'https://api.nexus.dev',
});
const agents = new AgentsResource(http);
await agents.create({ name: 'my-agent' });

// Types only (0 bytes runtime)
import type { Agent, CreateAgentParams } from '@nexus/sdk';
```

### Error Handling

All errors extend `NexusSDKError` from `@templar/errors`:

```typescript
import {
  NexusAPIError,
  NexusTimeoutError,
  NexusNetworkError,
  NexusValidationError,
} from '@nexus/sdk';

try {
  const agent = await client.agents.create({ name: 'test' });
} catch (error) {
  if (error instanceof NexusAPIError) {
    console.error('API Error:', error.statusCode, error.response);
  } else if (error instanceof NexusTimeoutError) {
    console.error('Request timed out after', error.timeout, 'ms');
  } else if (error instanceof NexusNetworkError) {
    console.error('Network error:', error.message);
  } else if (error instanceof NexusValidationError) {
    console.error('Validation error on field:', error.field);
  }
}
```

### Retry Configuration

```typescript
const client = new NexusClient({
  apiKey: 'xxx',
  retry: {
    maxAttempts: 5,              // Default: 3
    initialDelay: 2000,          // Default: 1000ms
    maxDelay: 20000,             // Default: 10000ms
    backoffMultiplier: 2.5,      // Default: 2
    retryableStatusCodes: [      // Default: [408, 429, 500, 502, 503, 504]
      408, 429, 500, 502, 503, 504
    ],
  },
});

// Or update after initialization
client.withRetry({
  maxAttempts: 10,
  initialDelay: 500,
});
```

### Custom Headers

```typescript
const client = new NexusClient({
  apiKey: 'xxx',
  headers: {
    'X-Custom-Header': 'value',
    'X-Request-ID': 'request-123',
  },
});
```

### Pagination

```typescript
let cursor: string | undefined;
const allAgents: Agent[] = [];

do {
  const response = await client.agents.list({
    limit: 100,
    cursor,
  });

  allAgents.push(...response.data);
  cursor = response.nextCursor;
} while (cursor);

console.log(`Fetched ${allAgents.length} agents`);
```

## Bundle Size

| Import Pattern | Size (gzipped) | Use Case |
|---------------|----------------|----------|
| Full SDK | ~8KB | Complete client, all resources |
| Single resource | ~3KB | Only need one resource (agents/tools/channels) |
| HttpClient only | ~2KB | Custom resource implementation |
| Types only | 0 bytes | Type definitions only |

The SDK is designed with tree-shaking in mind:
- `"sideEffects": false` in package.json
- ESM-only build
- Granular export paths
- Code splitting for shared chunks

## TypeScript

Full TypeScript support with strict types:

```typescript
import type {
  // Client config
  ClientConfig,
  RetryOptions,

  // Agents
  Agent,
  AgentStatus,
  CreateAgentParams,
  UpdateAgentParams,
  ListAgentsParams,

  // Tools
  Tool,
  ToolStatus,
  CreateToolParams,
  UpdateToolParams,
  ListToolsParams,

  // Channels
  Channel,
  ChannelType,
  ChannelStatus,
  CreateChannelParams,
  UpdateChannelParams,
  ListChannelsParams,

  // Pagination
  PaginatedResponse,
  PaginationParams,

  // Errors
  ErrorResponse,
} from '@nexus/sdk';
```

## Requirements

- Node.js 18+ or modern browser with `fetch()` support
- TypeScript 5.0+ (for best type inference)

## License

MIT

## Related Packages

- `@templar/core` - DeepAgents.js integration layer
- `@templar/errors` - Error class hierarchy
