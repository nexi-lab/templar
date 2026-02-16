import { BaseChannelAdapter, lazyLoad } from "@templar/channel-base";
import type { ContentBlock, InboundMessage, OutboundMessage } from "@templar/core";
import { VoiceConnectionFailedError } from "@templar/errors";

import { VOICE_CAPABILITIES } from "./capabilities.js";
import { parseVoiceConfig, type VoiceConfig } from "./config.js";
import { TemplarLLMBridge } from "./llm-bridge.js";
import { RoomManager } from "./room-manager.js";

// ---------------------------------------------------------------------------
// Types for LiveKit SDK (avoids top-level import)
// ---------------------------------------------------------------------------

/** Minimal AgentSession interface for LiveKit Agents */
interface AgentSession {
  start(roomUrl: string, token: string): Promise<void>;
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
  readonly type: "user_speech" | "agent_speech" | "transcription";
  readonly text: string;
  readonly participantIdentity: string;
  readonly roomName: string;
  readonly isFinal: boolean;
}

// ---------------------------------------------------------------------------
// Lazy loaders
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: Dynamic SDK module shape
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
 * Extends BaseChannelAdapter with:
 * - LiveKit Agents for voice pipeline (STT -> LLM bridge -> TTS)
 * - Configurable STT/TTS providers via LiveKit model strings
 * - Room auto-create or join-existing mode
 * - Streaming-first design for sub-2s response latency
 *
 * Each instance handles one voice session (Decision 15).
 */
export class VoiceChannel extends BaseChannelAdapter<VoiceEvent, VoiceClient> {
  private readonly config: VoiceConfig;
  private readonly llmBridge: TemplarLLMBridge;
  private roomManager: RoomManager | undefined;
  private agentSession: AgentSession | undefined;
  private eventListeners: Array<(raw: VoiceEvent) => void> = [];

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    const config = parseVoiceConfig(rawConfig);
    const llmBridge = new TemplarLLMBridge();

    super({
      name: "voice",
      capabilities: VOICE_CAPABILITIES,
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

  protected async doConnect(): Promise<void> {
    // 1. Lazy load LiveKit SDKs
    const [agentsMod, serverMod] = await Promise.all([loadAgents(), loadServerSdk()]);

    // 2. Create RoomManager with loaded SDK deps
    this.roomManager = new RoomManager(
      this.config.livekitUrl,
      this.config.apiKey,
      this.config.apiSecret,
    );
    this.roomManager.setSdkDeps({
      // biome-ignore lint/suspicious/noExplicitAny: LiveKit SDK constructor types
      RoomServiceClient: serverMod.RoomServiceClient as any,
      // biome-ignore lint/suspicious/noExplicitAny: LiveKit SDK constructor types
      AccessToken: serverMod.AccessToken as any,
    });

    // 3. Ensure room exists
    await this.roomManager.ensureRoom(this.config.room);

    // 4. Generate agent token and create session
    const token = await this.roomManager.generateToken(
      this.config.agentIdentity,
      this.config.room.name,
    );

    try {
      const AgentSessionClass = agentsMod.AgentSession as new (
        opts: Record<string, unknown>,
      ) => AgentSession;

      this.agentSession = new AgentSessionClass({
        stt: this.config.sttModel,
        tts: this.config.ttsModel,
        ttsVoice: this.config.ttsVoice,
        turnDetection: this.config.turnDetection,
      });

      // 5. Wire transcription events
      this.wireTranscriptionEvents();

      // 6. Start session
      await this.agentSession.start(this.config.livekitUrl, token);
    } catch (error) {
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
      } catch {
        // Best-effort cleanup
      }
      this.agentSession = undefined;
    }

    // 2. Delete room if autoCreate was used
    if (this.roomManager && this.config.room.autoCreate) {
      try {
        await this.roomManager.deleteRoom(this.config.room.name);
      } catch {
        // Best-effort cleanup
      }
    }

    // 3. Release references
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

  /** Get the LLM bridge (for wiring message handler in advanced usage) */
  getLlmBridge(): TemplarLLMBridge {
    return this.llmBridge;
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

      // Also route through LLM bridge for pipeline flow
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
}
