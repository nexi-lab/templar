import { randomUUID } from "node:crypto";
import { BaseChannelAdapter, lazyLoad } from "@templar/channel-base";
import type { ContentBlock, InboundMessage, OutboundMessage } from "@templar/core";
import {
  ChannelSendError,
  getErrorCause,
  getErrorMessage,
  VoiceConnectionFailedError,
} from "@templar/errors";
import { createVoiceCapabilities } from "./capabilities.js";
import { parseVoiceConfig, type VoiceConfig } from "./config.js";
import { splitSentences, TemplarLLMBridge } from "./llm-bridge.js";
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
 * Constructor: new AgentSession({ vad, stt, tts, turnDetection })
 * Start: session.start({ agent, room })
 */
interface AgentSession {
  start(opts: { agent: unknown; room: LiveKitRoom }): Promise<void>;
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
 * Create a LiveKit Agent subclass that bridges llmNode() to Templar's handler.
 *
 * In v1.x, the pipeline calls Agent.llmNode() with chat context from STT.
 * This override extracts the user message, routes it through the bridge
 * (which invokes the Templar handler), and returns a ReadableStream of
 * sentences for progressive TTS synthesis.
 */
function createTemplarAgentClass(
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic base from lazy-loaded @livekit/agents
  AgentBase: any,
  bridge: TemplarLLMBridge,
  roomName: string,
) {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic subclass of lazy-loaded Agent
  return class TemplarVoiceAgent extends (AgentBase as any) {
    constructor() {
      super({ instructions: "Templar voice agent" });
    }

    async llmNode(
      // biome-ignore lint/suspicious/noExplicitAny: LiveKit ChatContext type not available at compile time
      chatCtx: any,
      _toolCtx: unknown,
      _modelSettings: unknown,
    ): Promise<ReadableStream<string> | null> {
      const messages: Array<{ role: string; content: string; name?: string }> =
        chatCtx?.messages ?? chatCtx?.items ?? [];
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const text = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";

      if (!text.trim()) return null;

      const identity = lastUserMsg?.name ?? "unknown";
      const response = await bridge.processTranscription(text, identity, roomName);
      const sentences = splitSentences(response);

      return new ReadableStream<string>({
        start(controller) {
          for (const sentence of sentences) {
            controller.enqueue(sentence);
          }
          controller.close();
        },
      });
    }
  };
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
          messageId: `voice-${randomUUID()}`,
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
    // Note: We intentionally bypass LiveKit's Worker/defineAgent pattern.
    // Templar channels manage their own lifecycle — the Gateway owns routing
    // and session scoping. VoiceChannel acts as a custom client, not a Worker.
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

    // 3. Ensure room exists + generate token (independent, run in parallel)
    const [, token] = await Promise.all([
      this.roomManager.ensureRoom(this.config.room),
      this.roomManager.generateToken(this.config.agentIdentity, this.config.room.name),
    ]);

    try {
      // 5. Create and connect Room (v1.x: Room is separate from Session)
      const RoomClass = agentsMod.Room as new () => LiveKitRoom;
      this.room = new RoomClass();
      await this.room.connect(this.config.livekitUrl, token);

      // 6. Create Agent subclass with llmNode bridged to Templar
      const TemplarAgent = createTemplarAgentClass(
        agentsMod.Agent,
        this.llmBridge,
        this.config.room.name,
      );
      const agent = new TemplarAgent();

      // 7. Create AgentSession with STT/TTS config (LLM handled by Agent.llmNode)
      const AgentSessionClass = agentsMod.AgentSession as new (
        opts: Record<string, unknown>,
      ) => AgentSession;

      this.agentSession = new AgentSessionClass({
        stt: this.config.sttModel,
        tts: this.config.ttsModel,
        turnDetection: this.config.turnDetection,
      });

      // 8. Wire event listeners before starting session
      this.wireTranscriptionEvents();
      this.wireErrorEvents();

      // 9. Start session with agent + room (v1.x API)
      await this.agentSession.start({ agent, room: this.room });

      // 10. Record connect latency
      this.connectLatencyMs = Date.now() - this.connectStartTime;
    } catch (error) {
      // Disconnect room if it was connected (prevents WebRTC connection leak)
      if (this.room) {
        try {
          await this.room.disconnect();
        } catch {
          // Best-effort cleanup during error handling
        }
      }
      // Clean up all partial state on failure
      this.room = undefined;
      this.agentSession = undefined;
      this.roomManager = undefined;
      throw new VoiceConnectionFailedError(
        `Failed to start voice session: ${getErrorMessage(error)}`,
        { cause: getErrorCause(error) },
      );
    }
  }

  protected async doDisconnect(): Promise<void> {
    // 1. Close AgentSession
    if (this.agentSession) {
      try {
        await this.agentSession.close();
      } catch (error) {
        this.log("warn", "Error closing agent session", error);
      }
      this.agentSession = undefined;
    }

    // 2. Disconnect Room
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch (error) {
        this.log("warn", "Error disconnecting room", error);
      }
      this.room = undefined;
    }

    // 3. Delete room if autoCreate was used
    if (this.roomManager && this.config.room.autoCreate) {
      try {
        await this.roomManager.deleteRoom(this.config.room.name);
      } catch (error) {
        this.log("warn", "Error deleting room", error);
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
      // Support both positional args (text, identity) and event object ({ transcript, speakerId })
      const firstArg = args[0];
      let text: string;
      let identity: string;
      if (typeof firstArg === "object" && firstArg !== null && "transcript" in firstArg) {
        const evt = firstArg as { transcript?: string; speakerId?: string };
        text = typeof evt.transcript === "string" ? evt.transcript : "";
        identity = typeof evt.speakerId === "string" ? evt.speakerId : "unknown";
      } else {
        text = typeof firstArg === "string" ? firstArg : "";
        identity = typeof args[1] === "string" ? args[1] : "unknown";
        if (text === "" && typeof firstArg !== "string") {
          this.log("warn", "Unexpected user_speech_committed event shape", String(firstArg));
        }
      }

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
      // Note: STT → LLM flow is handled by the pipeline via Agent.llmNode()
    });

    this.agentSession.on("agent_speech_committed", (...args: unknown[]) => {
      const firstArg = args[0];
      const text =
        typeof firstArg === "object" && firstArg !== null && "transcript" in firstArg
          ? String((firstArg as { transcript?: string }).transcript ?? "")
          : typeof firstArg === "string"
            ? firstArg
            : "";
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

  /** Structured log helper — standardizes format and avoids DRY violation. */
  private log(level: "warn" | "error", context: string, error?: unknown): void {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const fn = level === "error" ? console.error : console.warn;
    fn(`[VoiceChannel] ${context}${message ? `: ${message}` : ""}`);
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

      this.log("error", `Session error (recoverable=${recoverable})`, error);

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
      this.log("warn", "Session closed unexpectedly");
      // Mark adapter as disconnected if session closes on its own
      if (this.isConnected) {
        this.setConnected(false);
      }
    });
  }
}
