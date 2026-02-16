/**
 * Mock LiveKit SDK classes for testing.
 *
 * Follows the biome-ignore pattern used in channel-telegram mocks.
 */

// ---------------------------------------------------------------------------
// Captured calls
// ---------------------------------------------------------------------------

export interface CapturedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

// ---------------------------------------------------------------------------
// MockRoomServiceClient
// ---------------------------------------------------------------------------

export class MockRoomServiceClient {
  readonly calls: CapturedCall[] = [];
  private rooms: Map<string, Record<string, unknown>> = new Map();

  /** Pre-populate rooms for listRooms checks */
  addRoom(name: string, data?: Record<string, unknown>): void {
    this.rooms.set(name, { name, ...data });
  }

  /** If shouldFail is set, createRoom will reject */
  shouldFail: string | undefined;

  async createRoom(opts: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method: "createRoom", args: [opts] });
    if (this.shouldFail) {
      throw new Error(this.shouldFail);
    }
    const name = opts.name as string;
    const room = { name, ...opts };
    this.rooms.set(name, room);
    return room;
  }

  async listRooms(names?: string[]): Promise<unknown[]> {
    this.calls.push({ method: "listRooms", args: [names] });
    if (this.shouldFail) {
      throw new Error(this.shouldFail);
    }
    if (!names) return [...this.rooms.values()];
    return names
      .map((n) => this.rooms.get(n))
      .filter((r): r is Record<string, unknown> => r !== undefined);
  }

  async deleteRoom(roomName: string): Promise<void> {
    this.calls.push({ method: "deleteRoom", args: [roomName] });
    if (this.shouldFail) {
      throw new Error(this.shouldFail);
    }
    this.rooms.delete(roomName);
  }
}

// ---------------------------------------------------------------------------
// MockAccessToken
// ---------------------------------------------------------------------------

export class MockAccessToken {
  readonly grants: Record<string, unknown>[] = [];
  private readonly jwtValue: string;

  constructor(_apiKey: string, _apiSecret: string) {
    this.jwtValue = `mock-jwt-${Date.now()}`;
  }

  addGrant(grant: Record<string, unknown>): void {
    this.grants.push(grant);
  }

  async toJwt(): Promise<string> {
    return this.jwtValue;
  }
}

// ---------------------------------------------------------------------------
// MockAgentSession
// ---------------------------------------------------------------------------

type EventCallback = (...args: unknown[]) => void;

export class MockAgentSession {
  readonly calls: CapturedCall[] = [];
  private listeners: Map<string, EventCallback[]> = new Map();
  started = false;
  closed = false;

  /** If set, start() will reject */
  shouldFailStart: string | undefined;

  async start(roomUrl: string, token: string): Promise<void> {
    this.calls.push({ method: "start", args: [roomUrl, token] });
    if (this.shouldFailStart) {
      throw new Error(this.shouldFailStart);
    }
    this.started = true;
  }

  async close(): Promise<void> {
    this.calls.push({ method: "close", args: [] });
    this.closed = true;
    this.started = false;
  }

  on(event: string, callback: EventCallback): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(callback);
    this.listeners.set(event, existing);
  }

  off(event: string, callback: EventCallback): void {
    const existing = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      existing.filter((cb) => cb !== callback),
    );
  }

  /** Simulate an event emission (for tests) */
  emit(event: string, ...args: unknown[]): void {
    const callbacks = this.listeners.get(event) ?? [];
    for (const cb of callbacks) {
      cb(...args);
    }
  }
}

// ---------------------------------------------------------------------------
// Mock SDK module factories (for lazy-load mocking)
// ---------------------------------------------------------------------------

/**
 * Creates a mock @livekit/agents module.
 * Pass a reference to capture the MockAgentSession instance.
 */
export function createMockAgentsModule(sessionRef?: {
  current: MockAgentSession | undefined;
}): Record<string, unknown> {
  return {
    AgentSession: class {
      constructor(_opts?: Record<string, unknown>) {
        const session = new MockAgentSession();
        if (sessionRef) sessionRef.current = session;
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return session;
      }
    },
  };
}

/**
 * Creates a mock livekit-server-sdk module.
 * Pass references to capture instances.
 */
export function createMockServerSdkModule(refs?: {
  roomServiceClient?: { current: MockRoomServiceClient | undefined };
  accessTokens?: MockAccessToken[];
}): Record<string, unknown> {
  return {
    RoomServiceClient: class {
      constructor(_url: string, _key: string, _secret: string) {
        const client = new MockRoomServiceClient();
        if (refs?.roomServiceClient) refs.roomServiceClient.current = client;
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return client;
      }
    },
    AccessToken: class {
      constructor(_apiKey: string, _apiSecret: string) {
        const token = new MockAccessToken(_apiKey, _apiSecret);
        if (refs?.accessTokens) refs.accessTokens.push(token);
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return token;
      }
    },
  };
}
