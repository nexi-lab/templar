/**
 * MockProvider for testing @templar/model-router consumers.
 *
 * Sequences through pre-configured responses in order.
 * Tracks all incoming requests for assertions.
 */

export interface MockCompletionResponse {
  readonly content: string;
  readonly model: string;
  readonly provider: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
  readonly finishReason: "stop" | "length" | "tool_calls" | "content_filter";
  readonly toolCalls?: readonly {
    readonly id: string;
    readonly name: string;
    readonly arguments: string;
  }[];
  readonly thinkingContent?: string;
  readonly raw: unknown;
}

export interface MockCompletionRequest {
  readonly model: string;
  readonly messages: readonly { readonly role: string; readonly content: string }[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly tools?: readonly unknown[];
  readonly thinking?: "adaptive" | "extended" | "standard" | "none";
  readonly responseFormat?: unknown;
}

export interface MockStreamChunk {
  readonly type: "content" | "tool_call" | "thinking" | "usage" | "done";
  readonly content?: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
}

export type MockResponseEntry = MockCompletionResponse | Error;

export class MockProvider {
  readonly id: string;
  private readonly responses: MockResponseEntry[];
  private callIndex = 0;
  readonly calls: MockCompletionRequest[] = [];

  constructor(id: string, responses: MockResponseEntry[] = []) {
    this.id = id;
    this.responses = responses;
  }

  async complete(
    request: MockCompletionRequest,
    signal?: AbortSignal,
  ): Promise<MockCompletionResponse> {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    this.calls.push(request);
    const response = this.responses[this.callIndex];
    this.callIndex++;

    if (!response) {
      throw new Error(
        `MockProvider "${this.id}": no response configured for call #${this.callIndex}`,
      );
    }

    if (response instanceof Error) {
      throw response;
    }

    return response;
  }

  async *stream(
    request: MockCompletionRequest,
    signal?: AbortSignal,
  ): AsyncIterable<MockStreamChunk> {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    this.calls.push(request);
    const response = this.responses[this.callIndex];
    this.callIndex++;

    if (!response) {
      throw new Error(
        `MockProvider "${this.id}": no response configured for call #${this.callIndex}`,
      );
    }

    if (response instanceof Error) {
      throw response;
    }

    // Simulate streaming by yielding content in chunks, then usage, then done
    if (response.content) {
      yield { type: "content" as const, content: response.content };
    }

    yield {
      type: "usage" as const,
      usage: response.usage,
    };

    yield { type: "done" as const };
  }

  get callCount(): number {
    return this.calls.length;
  }

  get lastRequest(): MockCompletionRequest | undefined {
    return this.calls[this.calls.length - 1];
  }

  reset(): void {
    this.calls.length = 0;
    this.callIndex = 0;
  }
}

/**
 * Helper to create a standard success response for mock providers.
 */
export function createMockResponse(
  overrides?: Partial<MockCompletionResponse>,
): MockCompletionResponse {
  return {
    content: "Hello, world!",
    model: "test-model",
    provider: "test-provider",
    usage: { inputTokens: 10, outputTokens: 20 },
    finishReason: "stop",
    raw: null,
    ...overrides,
  };
}
