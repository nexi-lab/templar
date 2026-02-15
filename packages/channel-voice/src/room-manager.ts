import { VoiceConnectionFailedError, VoiceRoomError } from "@templar/errors";

/** Room configuration subset needed by the manager */
export interface RoomConfig {
  readonly name: string;
  readonly autoCreate: boolean;
  readonly emptyTimeout: number;
  readonly maxParticipants: number;
}

/** Subset of livekit-server-sdk types (avoids top-level import) */
interface RoomServiceClient {
  createRoom(opts: Record<string, unknown>): Promise<unknown>;
  listRooms(names?: string[]): Promise<unknown[]>;
  deleteRoom(roomName: string): Promise<void>;
}

interface AccessToken {
  addGrant(grant: Record<string, unknown>): void;
  toJwt(): Promise<string>;
}

type RoomServiceClientConstructor = new (
  livekitUrl: string,
  apiKey: string,
  apiSecret: string,
) => RoomServiceClient;

type AccessTokenConstructor = new (apiKey: string, apiSecret: string) => AccessToken;

/** SDK dependency injection for testability */
export interface RoomManagerDeps {
  readonly RoomServiceClient: RoomServiceClientConstructor;
  readonly AccessToken: AccessTokenConstructor;
}

/**
 * Manages LiveKit room lifecycle and token generation.
 *
 * Lazily creates the RoomServiceClient on first use.
 * All operations throw domain-specific Voice* errors.
 */
export class RoomManager {
  private client: RoomServiceClient | undefined;
  private readonly livekitUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  // SDK constructors — set via constructor deps or setSdkDeps()
  private deps: RoomManagerDeps | undefined;

  constructor(livekitUrl: string, apiKey: string, apiSecret: string, deps?: RoomManagerDeps) {
    this.livekitUrl = livekitUrl;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.deps = deps;
  }

  /**
   * Inject SDK constructors (called after lazy loading).
   * Must be called before any room operations if deps were not passed to constructor.
   */
  setSdkDeps(deps: RoomManagerDeps): void {
    this.deps = deps;
  }

  /** Create room if autoCreate=true, verify it exists otherwise */
  async ensureRoom(config: RoomConfig): Promise<void> {
    const svc = this.getClient();

    if (config.autoCreate) {
      try {
        await svc.createRoom({
          name: config.name,
          emptyTimeout: config.emptyTimeout,
          maxParticipants: config.maxParticipants,
        });
      } catch (error) {
        throw new VoiceRoomError(
          `Failed to create room '${config.name}': ${error instanceof Error ? error.message : String(error)}`,
          { cause: error instanceof Error ? error : undefined },
        );
      }
    } else {
      try {
        const rooms = await svc.listRooms([config.name]);
        if (rooms.length === 0) {
          throw new VoiceRoomError(`Room '${config.name}' not found and autoCreate is disabled`);
        }
      } catch (error) {
        if (error instanceof VoiceRoomError) throw error;
        throw new VoiceRoomError(
          `Failed to verify room '${config.name}': ${error instanceof Error ? error.message : String(error)}`,
          { cause: error instanceof Error ? error : undefined },
        );
      }
    }
  }

  /** Generate JWT token for a participant to join the room */
  async generateToken(identity: string, roomName: string): Promise<string> {
    if (!this.deps) {
      throw new VoiceConnectionFailedError("SDK dependencies not initialized");
    }
    try {
      const token = new this.deps.AccessToken(this.apiKey, this.apiSecret);
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        identity,
      });
      return await token.toJwt();
    } catch (error) {
      throw new VoiceConnectionFailedError(
        `Failed to generate token for '${identity}': ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  /** Delete room on disconnect */
  async deleteRoom(roomName: string): Promise<void> {
    const svc = this.getClient();
    try {
      await svc.deleteRoom(roomName);
    } catch (error) {
      throw new VoiceRoomError(
        `Failed to delete room '${roomName}': ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  private getClient(): RoomServiceClient {
    if (!this.client) {
      if (!this.deps) {
        throw new VoiceConnectionFailedError("SDK dependencies not initialized");
      }
      this.client = new this.deps.RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret);
    }
    return this.client;
  }
}
