import { BaseChannelAdapter, lazyLoad } from "@templar/channel-base";
import type { ContentBlock, InboundMessage, OutboundMessage } from "@templar/core";
import { ChannelSendError, VoiceConnectionFailedError } from "@templar/errors";

import { createVoiceCapabilities } from "./capabilities.js";
import { parseVoiceConfig, type VoiceConfig } from "./config.js";
import { TemplarLLMBridge } from "./llm-bridge.js";
import { RoomManager } from "./room-manager.js";

// ---------------------------------------------------------------------------
// LiveKit v1.x SDK interfaces (avoids top-level import)
// ---------------------------------------------------------------------------

/**
 * Minimal LiveKit Room interface (v1.x).
 * The real class comes from @livekit/rtc-node or livekit-client.
 */
interface LiveKitRoom {
  connect(url: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Minimal AgentSession interface matching LiveKit Agents v1.x API.
 *
 * Constructor: new AgentSession({ vad, stt, llm, tts, turnDetection })
 * Start: session.start({ room, agent? })
 */
interface AgentSession {
  start(opts: { room: LiveKitRoom; agent?: unknown }): Promise<void>;
  close(): Promise<void>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
}

/** Opaque client reference passed to renderer */
export interface VoiceClient {
  readonly session: AgentSession | undefined;
  readonly llmBridge: TemplarLLMBridge;
}

/** Raw event from the voice pipeline */
export interface VoiceEvent {
  readonly type: "user_speech" | "agent_speech" | "transcription" | "error";
  readonly text: string;
  readonly participantIdentity: string;
  readonly roomName: string;
  readonly isFinal: boolean;
  readonly error?: Error;
}

// ---------------------------------------------------------------------------
// Lazy loaders
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: Dynamic SDK module shape varies across LiveKit versions
type SdkModule = Record<string, any>;

const loadAgents = lazyLoad<SdkModule>(
  "voice",
  "@livekit/agents",
  (mod: unknown) => mod as SdkModule,
);
const loadServerSdk = lazyLoad<SdkModule>(
  "voice",
  "livekit-server-sdk",
  (mod: unknown) => mod as SdkModule,
);

/**
 * Extract text content from outbound message blocks.
 * Concatenates all text blocks with newlines. Non-text blocks are ignored.
 */
function extractTextFromBlocks(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((b): b is ContentBlock & { type: "text" } => b.type === "text")
    .map((b) => b.content)
    .join("\n");
}

/**
 * Voice channel adapter using LiveKit WebRTC + STT/TTS.
 *
 * Uses LiveKit Agents v1.x API:
 * - Room for WebRTC transport
 * - AgentSession for STT/TTS pipeline with configurable model strings
 * - TemplarLLMBridge as custom LLM node bridging to Templar's MessageHandler
 *
 * Lifecycle: warmup() -> connect() -> send/receive -> disconnect()
 * Each instance handles one voice session.
 */
export class VoiceChannel extends BaseChannelAdapter<VoiceEvent, VoiceClient> {
  private readonly config: VoiceConfig;
  private readonly llmBridge: TemplarLLMBridge;
  private roomManager: RoomManager | undefined;
  private room: LiveKitRoom | undefined;
  private agentSession: AgentSession | undefined;
  private eventListeners: Array<(raw: VoiceEvent) => void> = [];

  /** Pre-loaded SDK modules from warmup() */
  private warmedAgentsMod: SdkModule | undefined;
  private warmedServerMod: SdkModule | undefined;

  /** Timing metrics for the last connection */
  private connectStartTime = 0;
  private connectLatencyMs = 0;

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    const config = parseVoiceConfig(rawConfig);
    const llmBridge = new TemplarLLMBridge({ responseTimeoutMs: config.responseTimeoutMs });

    super({
      name: "voice",
      capabilities: createVoiceCapabilities(config.room),
      normalizer: (event: VoiceEvent): InboundMessage | undefined => {
        // Only process final user speech transcriptions
        if (event.type !== "user_speech" || !event.isFinal) return undefined;
        if (!event.text.trim()) return undefined;

        const timestamp = Date.now();
        return {
          channelType: "voice",
          channelId: event.roomName,
          senderId: event.participantIdentity,
          blocks: [{ type: "text", content: event.text }],
          timestamp,
          messageId: `voice-${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
          raw: event,
        };
      },
      renderer: async (message: OutboundMessage, _client: VoiceClient): Promise<void> => {
        const text = extractTextFromBlocks(message.blocks);
        if (text) {
          llmBridge.provideResponse(text);
        }
      },
    });
    this.config = config;
    this.llmBridge = llmBridge;
  }

  /**
   * Pre-load LiveKit SDK modules to reduce connect() latency.
   * Call before connect() for faster first connection.
   * Safe to call multiple times (idempotent).
   */
  async warmup(): Promise<void> {
    if (this.warmedAgentsMod && this.warmedServerMod) return;
    const [agentsMod, serverMod] = await Promise.all([loadAgents(), loadServerSdk()]);
    this.warmedAgentsMod = agentsMod;
    this.warmedServerMod = serverMod;
  }

  protected async doConnect(): Promise<void> {
    this.connectStartTime = Date.now();

    // 1. Load SDKs (uses warmup cache if available)
    const agentsMod = this.warmedAgentsMod ?? (await loadAgents());
    const serverMod = this.warmedServerMod ?? (await loadServerSdk());

    // 2. Create RoomManager with loaded SDK deps
    this.roomManager = new RoomManager(
      this.config.livekitUrl,
      this.config.apiKey,
      this.config.apiSecret,
    );
    this.roomManager.setSdkDeps({
      // biome-ignore lint/suspicious/noExplicitAny: LiveKit SDK constructor types vary
      RoomServiceClient: serverMod.RoomServiceClient as any,
      // biome-ignore lint/suspicious/noExplicitAny: LiveKit SDK constructor types vary
      AccessToken: serverMod.AccessToken as any,
    });

    // 3. Ensure room exists
    await this.roomManager.ensureRoom(this.config.room);

    // 4. Generate agent token
    const token = await this.roomManager.generateToken(
      this.config.agentIdentity,
      this.config.room.name,
    );

    try {
      // 5. Create and connect Room (v1.x: Room is separate from Session)
      const RoomClass = agentsMod.Room as new () => LiveKitRoom;
      this.room = new RoomClass();
      await this.room.connect(this.config.livekitUrl, token);

      // 6. Create AgentSession with v1.x constructor params
      const AgentSessionClass = agentsMod.AgentSession as new (
        opts: Record<string, unknown>,
      ) => AgentSession;

      this.agentSession = new AgentSessionClass({
        stt: this.config.sttModel,
        llm: this.llmBridge.asLlmPlugin(),
        tts: this.config.ttsModel,
        turnDetection: this.config.turnDetection,
      });

      // 7. Wire event listeners before starting session
      this.wireTranscriptionEvents();
      this.wireErrorEvents();

      // 8. Start session with room reference (v1.x API)
      await this.agentSession.start({ room: this.room });

      // 9. Record connect latency
      this.connectLatencyMs = Date.now() - this.connectStartTime;
    } catch (error) {
      // Clean up all partial state on failure
      this.room = undefined;
      this.agentSession = undefined;
      this.roomManager = undefined;
      throw new VoiceConnectionFailedError(
        `Failed to start voice session: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  protected async doDisconnect(): Promise<void> {
    // 1. Close AgentSession
    if (this.agentSession) {
      try {
        await this.agentSession.close();
      } catch (error) {
        console.warn(
          "[VoiceChannel] Error closing agent session:",
          error instanceof Error ? error.message : String(error),
        );
      }
      this.agentSession = undefined;
    }

    // 2. Disconnect Room
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch (error) {
        console.warn(
          "[VoiceChannel] Error disconnecting room:",
          error instanceof Error ? error.message : String(error),
        );
      }
      this.room = undefined;
    }

    // 3. Delete room if autoCreate was used
    if (this.roomManager && this.config.room.autoCreate) {
      try {
        await this.roomManager.deleteRoom(this.config.room.name);
      } catch (error) {
        console.warn(
          "[VoiceChannel] Error deleting room:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    // 4. Reject any pending bridge response
    if (this.llmBridge.hasPending) {
      this.llmBridge.rejectPending(
        new ChannelSendError("voice", "Adapter disconnected while response was pending"),
      );
    }

    // 5. Release references
    this.roomManager = undefined;
    this.eventListeners = [];
  }

  protected registerListener(callback: (raw: VoiceEvent) => void): void {
    this.eventListeners.push(callback);
  }

  protected getClient(): VoiceClient {
    return {
      session: this.agentSession,
      llmBridge: this.llmBridge,
    };
  }

  /**
   * Generate a join token for a client (browser/mobile) to join the room.
   * Can only be called after connect().
   */
  async getJoinToken(identity: string): Promise<string> {
    if (!this.roomManager) {
      throw new VoiceConnectionFailedError(
        "Cannot generate token: adapter not connected. Call connect() first.",
      );
    }
    return this.roomManager.generateToken(identity, this.config.room.name);
  }

  /** Get the LLM bridge for wiring message handlers or testing */
  getLlmBridge(): TemplarLLMBridge {
    return this.llmBridge;
  }

  /** Get the recorded connect latency (ms). 0 if connect() hasn't completed. */
  getConnectLatencyMs(): number {
    return this.connectLatencyMs;
  }

  private wireTranscriptionEvents(): void {
    if (!this.agentSession) return;

    this.agentSession.on("user_speech_committed", (...args: unknown[]) => {
      const text = typeof args[0] === "string" ? args[0] : "";
      const identity = typeof args[1] === "string" ? args[1] : "unknown";

      const event: VoiceEvent = {
        type: "user_speech",
        text,
        participantIdentity: identity,
        roomName: this.config.room.name,
        isFinal: true,
      };

      for (const listener of this.eventListeners) {
        listener(event);
      }

      // Route through LLM bridge for pipeline flow
      if (text.trim()) {
        void this.llmBridge
          .processTranscription(text, identity, this.config.room.name)
          .catch((error: unknown) => {
            console.error(
              "[VoiceChannel] Pipeline error:",
              error instanceof Error ? error.message : String(error),
            );
          });
      }
    });

    this.agentSession.on("agent_speech_committed", (...args: unknown[]) => {
      const text = typeof args[0] === "string" ? args[0] : "";
      const event: VoiceEvent = {
        type: "agent_speech",
        text,
        participantIdentity: this.config.agentIdentity,
        roomName: this.config.room.name,
        isFinal: true,
      };

      for (const listener of this.eventListeners) {
        listener(event);
      }
    });
  }

  /**
   * Wire error and close event listeners on the agent session.
   * Maps LiveKit errors to VOICE_* error codes and emits through listeners.
   */
  private wireErrorEvents(): void {
    if (!this.agentSession) return;

    this.agentSession.on("error", (...args: unknown[]) => {
      const errorArg = args[0];
      const error =
        errorArg instanceof Error ? errorArg : new Error(String(errorArg ?? "Unknown voice error"));
      const recoverable = typeof args[1] === "boolean" ? args[1] : false;

      console.error(`[VoiceChannel] Session error (recoverable=${recoverable}):`, error.message);

      const event: VoiceEvent = {
        type: "error",
        text: error.message,
        participantIdentity: this.config.agentIdentity,
        roomName: this.config.room.name,
        isFinal: !recoverable,
        error,
      };

      for (const listener of this.eventListeners) {
        listener(event);
      }

      // Reject pending bridge response on non-recoverable errors
      if (!recoverable && this.llmBridge.hasPending) {
        this.llmBridge.rejectPending(
          new VoiceConnectionFailedError(`Non-recoverable session error: ${error.message}`),
        );
      }
    });

    this.agentSession.on("close", () => {
      console.warn("[VoiceChannel] Session closed unexpectedly");
      // Mark adapter as disconnected if session closes on its own
      if (this.isConnected) {
        this.setConnected(false);
      }
    });
  }
}
