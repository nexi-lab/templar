/**
 * Mock STT/TTS helpers for voice pipeline testing.
 */

export interface SttResult {
  readonly text: string;
  readonly isFinal: boolean;
  readonly confidence: number;
}

export interface TtsRequest {
  readonly text: string;
  readonly timestamp: number;
}

/**
 * Mock STT that returns predetermined transcription text.
 */
export class MockStt {
  private queue: SttResult[] = [];
  readonly processedCount: number = 0;

  /** Enqueue a transcription result */
  enqueue(text: string, isFinal = true, confidence = 0.95): void {
    this.queue.push({ text, isFinal, confidence });
  }

  /** Get next transcription result */
  next(): SttResult | undefined {
    return this.queue.shift();
  }

  /** Check if there are pending results */
  get hasPending(): boolean {
    return this.queue.length > 0;
  }
}

/**
 * Mock TTS that records text-to-synthesize calls.
 */
export class MockTts {
  readonly requests: TtsRequest[] = [];
  shouldFail: string | undefined;

  /** Record a TTS request */
  async synthesize(text: string): Promise<void> {
    if (this.shouldFail) {
      throw new Error(this.shouldFail);
    }
    this.requests.push({ text, timestamp: Date.now() });
  }

  /** Get the last synthesized text */
  get lastText(): string | undefined {
    return this.requests[this.requests.length - 1]?.text;
  }
}

/**
 * Create a complete set of STT/TTS mocks.
 */
export function createMockSttTts(): { stt: MockStt; tts: MockTts } {
  return {
    stt: new MockStt(),
    tts: new MockTts(),
  };
}
