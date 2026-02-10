import type { NexusClient } from "@nexus/sdk";
import { vi } from "vitest";

/**
 * Mock types for each resource on NexusClient.
 * Each method returns a Vitest mock function.
 */
export interface MockMemoryResource {
  store: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
  batchStore: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

export interface MockPayResource {
  getBalance: ReturnType<typeof vi.fn>;
  transfer: ReturnType<typeof vi.fn>;
  debit: ReturnType<typeof vi.fn>;
}

export interface MockAgentsResource {
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

export interface MockToolsResource {
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

export interface MockChannelsResource {
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

export interface MockNexusClient {
  client: NexusClient;
  mockMemory: MockMemoryResource;
  mockPay: MockPayResource;
  mockAgents: MockAgentsResource;
  mockTools: MockToolsResource;
  mockChannels: MockChannelsResource;
}

/**
 * Create a fully-mocked NexusClient for use in middleware tests.
 *
 * Returns the typed client plus references to each resource's mocks
 * for easy assertion access.
 *
 * @example
 * ```typescript
 * const { client, mockMemory, mockPay } = createMockNexusClient();
 * mockPay.getBalance.mockResolvedValue({ balance: 1000, currency: "credits", updated_at: "..." });
 * const middleware = new NexusPayMiddleware(client, config);
 * ```
 */
export function createMockNexusClient(): MockNexusClient {
  const mockMemory: MockMemoryResource = {
    store: vi.fn(),
    get: vi.fn(),
    query: vi.fn(),
    search: vi.fn(),
    batchStore: vi.fn(),
    delete: vi.fn(),
  };

  const mockPay: MockPayResource = {
    getBalance: vi.fn(),
    transfer: vi.fn(),
    debit: vi.fn(),
  };

  const mockAgents: MockAgentsResource = {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const mockTools: MockToolsResource = {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const mockChannels: MockChannelsResource = {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const client = {
    memory: mockMemory,
    pay: mockPay,
    agents: mockAgents,
    tools: mockTools,
    channels: mockChannels,
    withRetry: () => client,
    withTimeout: () => client,
  } as unknown as NexusClient;

  return { client, mockMemory, mockPay, mockAgents, mockTools, mockChannels };
}
