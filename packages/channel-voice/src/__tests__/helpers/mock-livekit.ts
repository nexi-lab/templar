/**
 * Mock LiveKit SDK classes for testing.
 *
 * Matches LiveKit Agents v1.x API surface:
 * - Room: connect/disconnect for WebRTC transport
 * - AgentSession: start({room}), close(), event listeners
 * - RoomServiceClient: server-side room CRUD
 * - AccessToken: JWT generation
 */
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Captured calls
// ---------------------------------------------------------------------------

export interface CapturedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

// ---------------------------------------------------------------------------
// MockRoom (v1.x: separate from AgentSession)
// ---------------------------------------------------------------------------

export class MockRoom {
  readonly calls: CapturedCall[] = [];
  connected = false;
  url = "";
  token = "";

  /** If set, connect() will reject */
  shouldFailConnect: string | undefined;

  async connect(url: string, token: string): Promise<void> {
    this.calls.push({ method: "connect", args: [url, token] });
    if (this.shouldFailConnect) {
      throw new Error(this.shouldFailConnect);
    }
    this.url = url;
    this.token = token;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.calls.push({ method: "disconnect", args: [] });
    this.connected = false;
  }
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

  /** If shouldFail is set, operations will reject */
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
// MockAgentSession (v1.x API: start({room}))
// ---------------------------------------------------------------------------

type EventCallback = (...args: unknown[]) => void;

export class MockAgentSession {
  readonly calls: CapturedCall[] = [];
  private listeners: Map<string, EventCallback[]> = new Map();
  started = false;
  closed = false;
  room: unknown;

  /** If set, start() will reject */
  shouldFailStart: string | undefined;

  /** v1.x start: takes { room, agent? } */
  async start(opts: { room: unknown; agent?: unknown }): Promise<void> {
    this.calls.push({ method: "start", args: [opts] });
    if (this.shouldFailStart) {
      throw new Error(this.shouldFailStart);
    }
    this.room = opts.room;
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

/** Reference holders for capturing mock instances */
export interface MockAgentsRefs {
  sessionRef?: { current: MockAgentSession | undefined };
  roomRef?: { current: MockRoom | undefined };
  /** Set before connect() to make Room.connect() fail */
  connectError?: { current: string | undefined };
  /** Set before connect() to make AgentSession.start() fail */
  startError?: { current: string | undefined };
}

export interface MockServerSdkRefs {
  roomServiceClient?: { current: MockRoomServiceClient | undefined };
  accessTokens?: MockAccessToken[];
  /** Pre-populate rooms in the mock RoomServiceClient on creation */
  prePopulatedRooms?: string[];
}

/**
 * Creates a mock @livekit/agents module (v1.x).
 * Includes Room and AgentSession classes.
 */
export function createMockAgentsModule(
  refs?: MockAgentsRefs | { current: MockAgentSession | undefined },
): Record<string, unknown> {
  // Support both old (sessionRef only) and new (full refs) signatures
  const sessionRef =
    refs && "current" in refs
      ? (refs as { current: MockAgentSession | undefined })
      : refs?.sessionRef;
  const roomRef = refs && "roomRef" in refs ? refs.roomRef : undefined;
  const connectError = refs && "connectError" in refs ? refs.connectError : undefined;
  const startError = refs && "startError" in refs ? refs.startError : undefined;

  return {
    Room: class {
      constructor() {
        const room = new MockRoom();
        if (connectError?.current) room.shouldFailConnect = connectError.current;
        if (roomRef) roomRef.current = room;
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return room;
      }
    },
    AgentSession: class {
      constructor(_opts?: Record<string, unknown>) {
        const session = new MockAgentSession();
        if (startError?.current) session.shouldFailStart = startError.current;
        if (sessionRef) sessionRef.current = session;
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return session;
      }
    },
  };
}

/**
 * Creates a mock livekit-server-sdk module.
 * Supports prePopulatedRooms for autoCreate=false tests.
 */
export function createMockServerSdkModule(refs?: MockServerSdkRefs): Record<string, unknown> {
  return {
    RoomServiceClient: class {
      constructor(_url: string, _key: string, _secret: string) {
        const client = new MockRoomServiceClient();
        if (refs?.prePopulatedRooms) {
          for (const roomName of refs.prePopulatedRooms) {
            client.addRoom(roomName);
          }
        }
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

// ---------------------------------------------------------------------------
// Shared lazyLoad mock setup (Issue 5: DRY)
// ---------------------------------------------------------------------------

/**
 * Sets up vi.mock for @templar/channel-base to intercept lazyLoad calls.
 * Dispatches module loading to the appropriate mock factory.
 *
 * Usage: call setupLazyLoadMock(refs) in your test file, then use
 * vi.mock("@templar/channel-base", ...) with the returned factory.
 */
export function createLazyLoadMocker(
  agentsRefs: MockAgentsRefs | { current: MockAgentSession | undefined },
  serverRefs: MockServerSdkRefs,
): () => Promise<Record<string, unknown>> {
  return async () => {
    const actual = await vi.importActual("@templar/channel-base");
    return {
      ...(actual as Record<string, unknown>),
      lazyLoad: (_name: string, moduleName: string, _extract: unknown) => {
        return async () => {
          if (moduleName === "@livekit/agents") {
            return createMockAgentsModule(agentsRefs);
          }
          if (moduleName === "livekit-server-sdk") {
            return createMockServerSdkModule(serverRefs);
          }
          throw new Error(`Unexpected module: ${moduleName}`);
        };
      },
    };
  };
}
