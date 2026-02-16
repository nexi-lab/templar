import type { ContentBlock, InboundMessage, MessageHandler } from "@templar/core";
import { VoicePipelineError } from "@templar/errors";

/** Default timeout for awaiting a response from the Templar handler (ms) */
const DEFAULT_RESPONSE_TIMEOUT_MS = 30_000;

/**
 * Split text into sentences at punctuation boundaries.
 * Used for progressive TTS — each sentence can be synthesized
 * as soon as it's available instead of waiting for the full response.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Split on whitespace following sentence-ending punctuation (.!?)
  // Lookbehind keeps the punctuation attached to the preceding sentence
  const parts = trimmed.split(/(?<=[.!?])\s+/);
  return parts.filter((s) => s.trim().length > 0);
}

/**
 * Bridge between LiveKit Agents' LLM slot and Templar's ChannelAdapter.
 *
 * When LiveKit's pipeline calls processTranscription() with STT output:
 * 1. Converts to InboundMessage (TextBlock)
 * 2. Calls registered MessageHandler
 * 3. Waits for send() response (via pending promise)
 * 4. Returns response text to TTS pipeline
 *
 * Each instance handles one conversation turn at a time (Decision 15).
 */
export class TemplarLLMBridge {
  private messageHandler: MessageHandler | undefined;
  private pendingResponse:
    | {
        resolve: (text: string) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  private readonly responseTimeoutMs: number;

  /** Timing: tracks last processTranscription → provideResponse round-trip */
  private responseStartTime = 0;
  private lastResponseLatencyMs = 0;

  constructor(options?: { responseTimeoutMs?: number }) {
    this.responseTimeoutMs = options?.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
  }

  /** Register the Templar message handler */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Called by LiveKit pipeline with STT output, returns text for TTS.
   *
   * Creates an InboundMessage from the transcription, invokes the
   * Templar handler, and waits for provideResponse() to be called
   * when the adapter's send() delivers the agent's reply.
   */
  async processTranscription(
    text: string,
    participantIdentity: string,
    roomName: string,
  ): Promise<string> {
    if (!this.messageHandler) {
      throw new VoicePipelineError("No message handler registered");
    }

    if (this.pendingResponse) {
      throw new VoicePipelineError("A transcription is already being processed (concurrent call)");
    }

    const blocks: readonly ContentBlock[] = [{ type: "text", content: text }];
    const timestamp = Date.now();
    const messageId = `voice-${timestamp}-${Math.random().toString(36).slice(2, 9)}`;

    const inbound: InboundMessage = {
      channelType: "voice",
      channelId: roomName,
      senderId: participantIdentity,
      blocks,
      timestamp,
      messageId,
      raw: { transcription: text, participantIdentity, roomName },
    };

    // Track response latency from this point
    this.responseStartTime = Date.now();

    // Create the pending promise before calling the handler
    const responsePromise = new Promise<string>((resolve, reject) => {
      this.pendingResponse = { resolve, reject };
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (this.pendingResponse) {
        this.pendingResponse.reject(
          new VoicePipelineError(`Response timeout after ${this.responseTimeoutMs}ms`),
        );
        this.pendingResponse = undefined;
      }
    }, this.responseTimeoutMs);

    try {
      // Invoke the handler — it may call adapter.send() synchronously
      // (which calls provideResponse()) or return a promise we await
      await this.messageHandler(inbound);
    } catch (error) {
      clearTimeout(timeoutId);
      this.pendingResponse = undefined;
      throw new VoicePipelineError(
        `Handler error: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }

    try {
      return await responsePromise;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Called by adapter.send() to provide the response text.
   * Resolves the pending promise so processTranscription() returns.
   */
  provideResponse(text: string): void {
    if (!this.pendingResponse) {
      // No pending transcription — silently ignore (send() called without prior STT)
      return;
    }
    if (this.responseStartTime > 0) {
      this.lastResponseLatencyMs = Date.now() - this.responseStartTime;
      this.responseStartTime = 0;
    }
    const { resolve } = this.pendingResponse;
    this.pendingResponse = undefined;
    resolve(text);
  }

  /**
   * Called on error to reject the pending promise.
   */
  rejectPending(error: Error): void {
    if (!this.pendingResponse) return;
    const { reject } = this.pendingResponse;
    this.pendingResponse = undefined;
    reject(error);
  }

  /** Check if there is a pending transcription awaiting response */
  get hasPending(): boolean {
    return this.pendingResponse !== undefined;
  }

  /** Check if a message handler is registered */
  get hasHandler(): boolean {
    return this.messageHandler !== undefined;
  }

  /** Get the latency of the last completed response round-trip (ms). 0 if none. */
  getLastResponseLatencyMs(): number {
    return this.lastResponseLatencyMs;
  }

  /**
   * Returns a plain object matching LiveKit Agents' LLM plugin interface.
   * When passed to AgentSession as `llm`, LiveKit will call `chat()` with
   * STT output. The response is split into sentences for progressive TTS.
   */
  asLlmPlugin(): {
    chat: (text: string, identity: string, room: string) => AsyncGenerator<string>;
  } {
    const bridge = this;
    return {
      async *chat(text: string, identity: string, room: string): AsyncGenerator<string> {
        const response = await bridge.processTranscription(text, identity, room);
        const sentences = splitSentences(response);
        for (const sentence of sentences) {
          yield sentence;
        }
      },
    };
  }
}
