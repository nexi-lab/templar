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

export interface MockEventLogResource {
  write: ReturnType<typeof vi.fn>;
  batchWrite: ReturnType<typeof vi.fn>;
}

export interface MockPermissionsResource {
  checkPermission: ReturnType<typeof vi.fn>;
  grantPermission: ReturnType<typeof vi.fn>;
  listNamespaceTools: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// ACE sub-resource mocks
// ---------------------------------------------------------------------------

export interface MockTrajectoriesResource {
  start: ReturnType<typeof vi.fn>;
  logStep: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
}

export interface MockPlaybooksResource {
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  recordUsage: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
}

export interface MockReflectionResource {
  reflect: ReturnType<typeof vi.fn>;
}

export interface MockCurationResource {
  curate: ReturnType<typeof vi.fn>;
  curateBulk: ReturnType<typeof vi.fn>;
}

export interface MockConsolidationResource {
  consolidate: ReturnType<typeof vi.fn>;
  buildHierarchy: ReturnType<typeof vi.fn>;
}

export interface MockFeedbackResource {
  add: ReturnType<typeof vi.fn>;
  getScore: ReturnType<typeof vi.fn>;
  markForRelearn: ReturnType<typeof vi.fn>;
  getForTrajectory: ReturnType<typeof vi.fn>;
}

export interface MockAceResource {
  trajectories: MockTrajectoriesResource;
  playbooks: MockPlaybooksResource;
  reflection: MockReflectionResource;
  curation: MockCurationResource;
  consolidation: MockConsolidationResource;
  feedback: MockFeedbackResource;
}

export interface MockPairingResource {
  addPeer: ReturnType<typeof vi.fn>;
  listPeers: ReturnType<typeof vi.fn>;
  removePeer: ReturnType<typeof vi.fn>;
}

export interface MockNexusClient {
  client: NexusClient;
  mockMemory: MockMemoryResource;
  mockPay: MockPayResource;
  mockAgents: MockAgentsResource;
  mockTools: MockToolsResource;
  mockChannels: MockChannelsResource;
  mockEventLog: MockEventLogResource;
  mockPermissions: MockPermissionsResource;
  mockAce: MockAceResource;
  mockPairing: MockPairingResource;
}

/**
 * Create a fully-mocked NexusClient for use in middleware tests.
 *
 * Returns the typed client plus references to each resource's mocks
 * for easy assertion access.
 *
 * @example
 * ```typescript
 * const { client, mockMemory, mockPay, mockAce } = createMockNexusClient();
 * mockAce.trajectories.start.mockResolvedValue({ trajectory_id: "t-1", status: "active" });
 * const middleware = new NexusAceMiddleware(client, config);
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

  const mockEventLog: MockEventLogResource = {
    write: vi.fn(),
    batchWrite: vi.fn(),
  };

  const mockPermissions: MockPermissionsResource = {
    checkPermission: vi.fn(),
    grantPermission: vi.fn(),
    listNamespaceTools: vi.fn(),
  };

  const mockAce: MockAceResource = {
    trajectories: {
      start: vi.fn(),
      logStep: vi.fn(),
      complete: vi.fn(),
      get: vi.fn(),
      query: vi.fn(),
    },
    playbooks: {
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      recordUsage: vi.fn(),
      query: vi.fn(),
    },
    reflection: {
      reflect: vi.fn(),
    },
    curation: {
      curate: vi.fn(),
      curateBulk: vi.fn(),
    },
    consolidation: {
      consolidate: vi.fn(),
      buildHierarchy: vi.fn(),
    },
    feedback: {
      add: vi.fn(),
      getScore: vi.fn(),
      markForRelearn: vi.fn(),
      getForTrajectory: vi.fn(),
    },
  };

  const mockPairing: MockPairingResource = {
    addPeer: vi.fn(),
    listPeers: vi.fn(),
    removePeer: vi.fn(),
  };

  const client = {
    memory: mockMemory,
    pay: mockPay,
    agents: mockAgents,
    tools: mockTools,
    channels: mockChannels,
    eventLog: mockEventLog,
    permissions: mockPermissions,
    ace: mockAce,
    pairing: mockPairing,
    withRetry: () => client,
    withTimeout: () => client,
  } as unknown as NexusClient;

  return {
    client,
    mockMemory,
    mockPay,
    mockAgents,
    mockTools,
    mockChannels,
    mockEventLog,
    mockPermissions,
    mockAce,
    mockPairing,
  };
}
