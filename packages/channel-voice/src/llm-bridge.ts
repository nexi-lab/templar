import type { ContentBlock, InboundMessage, MessageHandler } from "@templar/core";
import { VoicePipelineError } from "@templar/errors";

/** Default timeout for awaiting a response from the Templar handler (ms) */
const DEFAULT_RESPONSE_TIMEOUT_MS = 30_000;

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
      // Invoke the handler (fire-and-forget style — the handler will
      // eventually call adapter.send(), which calls provideResponse())
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
}
