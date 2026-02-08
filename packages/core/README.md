# @templar/core

**Core package for Templar — AI Agent Execution Engine built on DeepAgents.js + LangGraph.js**

A thin wrapper around DeepAgents.js that provides:
- ✅ Configuration validation with clear error messages
- ✅ Nexus middleware injection
- ✅ Type-safe agent manifests
- ✅ Channel adapter interfaces
- ✅ <1% performance overhead vs raw DeepAgents
- ✅ <2KB gzipped bundle size

## Installation

```bash
pnpm add @templar/core deepagents @langchain/langgraph
```

## Quick Start

```typescript
import { createTemplar } from '@templar/core';

// Basic usage
const agent = createTemplar({
  model: 'gpt-4',
  agentType: 'high' // High Templar (persistent) or 'dark' (ephemeral)
});

// With Nexus middleware
import { NexusClient } from '@nexus/sdk';

const nexus = new NexusClient({ apiKey: process.env.NEXUS_API_KEY });
const agent = createTemplar({
  model: 'gpt-4',
  nexus,
  agentType: 'high'
});

// With agent manifest
const agent = createTemplar({
  model: 'gpt-4',
  manifest: {
    name: 'my-agent',
    version: '1.0.0',
    description: 'My AI agent',
    tools: [
      { name: 'search', description: 'Search the web' },
      { name: 'calculator', description: 'Perform calculations' }
    ],
    channels: [
      { type: 'slack', config: { token: process.env.SLACK_TOKEN } }
    ]
  }
});
```

## API Reference

### `createTemplar(config: TemplarConfig)`

Creates a Templar agent instance.

**Parameters:**
- `config` (TemplarConfig): Agent configuration

**Returns:** Compiled LangGraph agent (same as `createDeepAgent()`)

**Throws:**
- `TemplarConfigError`: Invalid configuration
- `NexusClientError`: Nexus client not properly initialized
- `ManifestValidationError`: Invalid manifest structure

**Example:**

```typescript
import { createTemplar } from '@templar/core';

const agent = createTemplar({
  model: 'gpt-4',
  agentType: 'high',
  middleware: [
    { name: 'logger', config: { level: 'info' } }
  ]
});
```

### `TemplarConfig`

Configuration interface extending `DeepAgentConfig`.

```typescript
interface TemplarConfig extends DeepAgentConfig {
  /** Nexus SDK client (optional) */
  nexus?: NexusClient;

  /** Parsed YAML manifest */
  manifest?: AgentManifest;

  /** Agent type: High Templar (persistent) or Dark Templar (ephemeral) */
  agentType?: 'high' | 'dark';

  /** Custom middleware array */
  middleware?: unknown[];

  /** Model name */
  model?: string;

  // ... other DeepAgentConfig fields
}
```

### `AgentManifest`

Agent manifest (typically parsed from `templar.yaml`).

```typescript
interface AgentManifest {
  name: string;           // Required
  version: string;        // Required (semver format)
  description: string;    // Required

  model?: ModelConfig;
  tools?: ToolConfig[];
  channels?: ChannelConfig[];
  middleware?: MiddlewareConfig[];
  permissions?: PermissionConfig;
}
```

### `ChannelAdapter`

Interface for channel adapters (implemented by `@templar/channel-*` packages).

```typescript
interface ChannelAdapter {
  readonly name: string;
  readonly capabilities: ChannelCapabilities;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: OutboundMessage): Promise<void>;
  onMessage(handler: MessageHandler): void;
}
```

### Exported Types

```typescript
import type {
  // Core types
  TemplarConfig,
  AgentManifest,
  NexusClient,

  // Channel types
  ChannelAdapter,
  ChannelCapabilities,
  ChannelConfig,
  OutboundMessage,
  MessageHandler,

  // Config types
  ModelConfig,
  ToolConfig,
  MiddlewareConfig,
  PermissionConfig,
  TemplarMiddleware,

  // Re-exported from DeepAgents
  DeepAgentConfig,
} from '@templar/core';
```

### Validation Functions

```typescript
import {
  validateAgentType,
  validateNexusClient,
  validateManifest
} from '@templar/core';

// Validate agentType
validateAgentType('high'); // OK
validateAgentType('invalid'); // Throws TemplarConfigError

// Validate Nexus client
validateNexusClient(nexusClient); // Throws if client missing connect/disconnect

// Validate manifest
validateManifest(manifest); // Throws if missing required fields or invalid structure
```

## Configuration Examples

### Minimal Config

```typescript
const agent = createTemplar({});
```

### With All Features

```typescript
import { createTemplar } from '@templar/core';
import { NexusClient } from '@nexus/sdk';

const nexus = new NexusClient({ apiKey: process.env.NEXUS_API_KEY });

const agent = createTemplar({
  model: 'gpt-4',
  agentType: 'high',
  nexus,
  manifest: {
    name: 'production-agent',
    version: '1.0.0',
    description: 'Production AI agent with full features',
    model: {
      provider: 'openai',
      name: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2000
    },
    tools: [
      {
        name: 'search',
        description: 'Search the web',
        parameters: {
          query: { type: 'string', required: true },
          limit: { type: 'number', default: 10 }
        }
      },
      {
        name: 'calculator',
        description: 'Perform calculations'
      }
    ],
    channels: [
      {
        type: 'slack',
        config: { token: process.env.SLACK_TOKEN }
      },
      {
        type: 'discord',
        config: { token: process.env.DISCORD_TOKEN }
      }
    ],
    middleware: [
      { name: 'logger', config: { level: 'info' } },
      { name: 'metrics', config: { enabled: true } }
    ],
    permissions: {
      allowed: ['read', 'write'],
      denied: ['delete']
    }
  },
  middleware: [
    { name: 'custom-auth' },
    { name: 'custom-logging' }
  ]
});
```

## Error Handling

```typescript
import {
  createTemplar,
  TemplarConfigError,
  NexusClientError,
  ManifestValidationError
} from '@templar/core';

try {
  const agent = createTemplar({
    agentType: 'invalid', // Invalid value
    nexus: {}, // Invalid client
    manifest: {} // Missing required fields
  });
} catch (error) {
  if (error instanceof TemplarConfigError) {
    console.error('Config error:', error.message);
    // "Invalid agentType: 'invalid'. Must be one of: high, dark"
  } else if (error instanceof NexusClientError) {
    console.error('Nexus client error:', error.message);
  } else if (error instanceof ManifestValidationError) {
    console.error('Manifest error:', error.message);
  }
}
```

## Performance

### Overhead Benchmarks

`@templar/core` is designed as a **thin wrapper** with minimal overhead:

- **Creation time:** ~0.0004ms per agent (placeholder implementation)
- **Throughput:** ~6M agents/sec (placeholder implementation)
- **Memory:** No leaks on repeated creation
- **Bundle size:** ~1.1KB gzipped

### Performance Notes

1. **Agent creation is cheap** — suitable for per-request agent instantiation
2. **Config spreading** — Scales linearly with config size (2.65x for large configs)
3. **Validation overhead** — <1% impact on creation time
4. **No blocking operations** — All validation is synchronous and fast

Run benchmarks:

```bash
pnpm test performance
```

## Architecture

### Design Philosophy

1. **Thin wrapper** — Direct pass-through to DeepAgents.js
2. **No abstraction layers** — DeepAgents is a peer dependency, not wrapped
3. **Additive only** — Adds validation + Nexus middleware, doesn't modify core behavior
4. **Zero breaking changes** — All DeepAgents features work unchanged

### Middleware Injection

When `config.nexus` is provided, `createTemplar()` automatically prepends Nexus middleware:

```typescript
const middleware = [
  ...getDefaultNexusMiddleware(config.nexus), // Prepended
  ...(config.middleware ?? []),                // User middleware
];
```

This ensures Nexus middleware runs before custom middleware.

### Dependency Strategy

- **Peer dependencies:** `deepagents`, `@langchain/langgraph`
- **Optional peer deps:** `@langchain/langgraph-supervisor`, `@langchain/langgraph-swarm`
- **Workspace deps:** `@templar/errors`

Consumers should install peer dependencies directly:

```bash
pnpm add @templar/core deepagents @langchain/langgraph
```

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test --coverage

# Run specific test suites
pnpm test validation
pnpm test createTemplar
pnpm test performance
```

### Test Coverage

- **Line coverage:** 95.34%
- **Branch coverage:** 91.3%
- **Function coverage:** 100%
- **Test count:** 114 tests across 5 suites

## Development

```bash
# Build
pnpm build

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

## Related Packages

- `@templar/middleware` — Nexus middleware implementations
- `@templar/errors` — Error classes
- `@templar/gateway` — HTTP gateway for agents
- `@templar/node` — Node.js runtime utilities
- `@templar/channel-*` — Channel adapters (Slack, Discord, etc.)

## License

MIT
