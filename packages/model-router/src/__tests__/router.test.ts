import {
  ExternalError,
  PermissionError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelRouter } from "../router.js";
import type {
  CompletionRequest,
  CompletionResponse,
  ModelProvider,
  ModelRef,
  ModelRouterConfig,
  StreamChunk,
  UsageEvent,
} from "../types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeResponse(overrides?: Partial<CompletionResponse>): CompletionResponse {
  return {
    content: "Hello!",
    model: "gpt-4o",
    provider: "openai",
    usage: { inputTokens: 10, outputTokens: 20 },
    finishReason: "stop",
    raw: null,
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<CompletionRequest>): CompletionRequest {
  return {
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  };
}

function createMockProvider(
  id: string,
  responses: Array<CompletionResponse | Error>,
): ModelProvider {
  let callIndex = 0;
  const calls: CompletionRequest[] = [];

  return {
    id,
    async complete(request: CompletionRequest, signal?: AbortSignal) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      calls.push(request);
      const resp = responses[callIndex++];
      if (!resp) throw new Error(`No response for call #${callIndex}`);
      if (resp instanceof Error) throw resp;
      return resp;
    },
    async *stream(request: CompletionRequest, signal?: AbortSignal) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      calls.push(request);
      const resp = responses[callIndex++];
      if (!resp) throw new Error(`No response for call #${callIndex}`);
      if (resp instanceof Error) throw resp;
      yield { type: "content" as const, content: resp.content };
      yield { type: "usage" as const, usage: resp.usage };
      yield { type: "done" as const };
    },
    get _calls() {
      return calls;
    },
  } as ModelProvider & { _calls: CompletionRequest[] };
}

function makeConfig(overrides?: Partial<ModelRouterConfig>): ModelRouterConfig {
  return {
    providers: {
      openai: { keys: [{ key: "sk-1" }, { key: "sk-2" }] },
    },
    defaultModel: { provider: "openai", model: "gpt-4o" },
    maxRetries: 2,
    retryBaseDelayMs: 10,
    retryMaxDelayMs: 50,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ModelRouter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("complete() - happy path", () => {
    it("routes to the default provider and returns response", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
      expect(result.provider).toBe("openai");
    });

    it("applies model overrides from ModelRef", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig({
        defaultModel: { provider: "openai", model: "gpt-4o", temperature: 0.5 },
      });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      await router.complete(makeRequest());
      const calls = (provider as unknown as { _calls: CompletionRequest[] })._calls;
      expect(calls[0]?.temperature).toBe(0.5);
    });
  });

  describe("complete() - failover", () => {
    it("falls back to next provider on model_error", async () => {
      const error = new ExternalError<"MODEL_PROVIDER_ERROR">({
        code: "MODEL_PROVIDER_ERROR",
        message: "Provider error",
      });
      const failProvider = createMockProvider("openai", [error, error, error]);
      const successResponse = makeResponse({ provider: "anthropic", model: "claude-3" });
      const backupProvider = createMockProvider("anthropic", [successResponse]);

      const config = makeConfig({
        providers: {
          openai: { keys: [{ key: "sk-1" }] },
          anthropic: { keys: [{ key: "ak-1" }] },
        },
        fallbackChain: [{ provider: "anthropic", model: "claude-3" }],
      });
      const router = new ModelRouter(
        config,
        new Map([
          ["openai", failProvider],
          ["anthropic", backupProvider],
        ]),
      );

      const result = await router.complete(makeRequest());
      expect(result.provider).toBe("anthropic");
    });

    it("rotates keys on auth failure", async () => {
      const authError = new PermissionError<"MODEL_PROVIDER_AUTH_FAILED">({
        code: "MODEL_PROVIDER_AUTH_FAILED",
        message: "Invalid API key",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [authError, response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
    });

    it("retries with backoff on rate limit", async () => {
      const rateLimitError = new RateLimitError<"MODEL_PROVIDER_RATE_LIMITED">({
        code: "MODEL_PROVIDER_RATE_LIMITED",
        message: "Rate limited",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [rateLimitError, response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
    });

    it("retries on timeout", async () => {
      const timeoutError = new TimeoutError<"MODEL_PROVIDER_TIMEOUT">({
        code: "MODEL_PROVIDER_TIMEOUT",
        message: "Timeout",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [timeoutError, response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
    });
  });

  describe("complete() - thinking downgrade", () => {
    it("retries with thinking:none on context overflow", async () => {
      const overflowError = new ValidationError<"MODEL_CONTEXT_OVERFLOW">({
        code: "MODEL_CONTEXT_OVERFLOW",
        message: "Context overflow",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [overflowError, response]);
      const config = makeConfig({ thinkingDowngrade: true });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest({ thinking: "extended" }));
      expect(result.content).toBe("Hello!");
    });

    it("does not downgrade when thinkingDowngrade is false", async () => {
      const overflowError = new ValidationError<"MODEL_CONTEXT_OVERFLOW">({
        code: "MODEL_CONTEXT_OVERFLOW",
        message: "Context overflow",
      });
      const provider = createMockProvider("openai", [overflowError]);
      const config = makeConfig({ thinkingDowngrade: false });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      await expect(router.complete(makeRequest({ thinking: "extended" }))).rejects.toThrow();
    });
  });

  describe("complete() - all providers fail", () => {
    it("throws MODEL_ALL_PROVIDERS_FAILED when all retries exhausted", async () => {
      const error = new ExternalError<"MODEL_PROVIDER_ERROR">({
        code: "MODEL_PROVIDER_ERROR",
        message: "Provider error",
      });
      const provider = createMockProvider("openai", [error, error, error]);
      const config = makeConfig({ maxRetries: 0 });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      try {
        await router.complete(makeRequest());
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ExternalError);
        expect((err as ExternalError<"MODEL_ALL_PROVIDERS_FAILED">).code).toBe(
          "MODEL_ALL_PROVIDERS_FAILED",
        );
      }
    });
  });

  describe("complete() - abort signal", () => {
    it("respects abort signal cancellation", async () => {
      const controller = new AbortController();
      controller.abort();

      const provider = createMockProvider("openai", [makeResponse()]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      await expect(router.complete(makeRequest(), controller.signal)).rejects.toThrow();
    });
  });

  describe("stream() - happy path", () => {
    it("streams chunks from the provider", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.stream(makeRequest())) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((c) => c.type === "content")).toBe(true);
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });
  });

  describe("stream() - head-of-stream retry", () => {
    it("retries on error before first chunk", async () => {
      const error = new TimeoutError<"MODEL_PROVIDER_TIMEOUT">({
        code: "MODEL_PROVIDER_TIMEOUT",
        message: "Timeout",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [error, response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.stream(makeRequest())) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.type === "content")).toBe(true);
    });
  });

  describe("stream() - mid-stream error propagation", () => {
    it("propagates errors after first chunk", async () => {
      // Create a provider that yields one chunk then errors
      const midStreamProvider: ModelProvider = {
        id: "openai",
        async complete() {
          throw new Error("not implemented");
        },
        async *stream() {
          yield { type: "content" as const, content: "partial" };
          throw new Error("mid-stream error");
        },
      };

      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", midStreamProvider]]));

      const chunks: StreamChunk[] = [];
      await expect(async () => {
        for await (const chunk of router.stream(makeRequest())) {
          chunks.push(chunk);
        }
      }).rejects.toThrow("mid-stream error");

      // Should have received at least the first chunk before the error
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("stream() - all providers fail", () => {
    it("throws MODEL_ALL_PROVIDERS_FAILED", async () => {
      const error = new ExternalError<"MODEL_PROVIDER_ERROR">({
        code: "MODEL_PROVIDER_ERROR",
        message: "Provider error",
      });
      const provider = createMockProvider("openai", [error, error, error]);
      const config = makeConfig({ maxRetries: 0 });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      await expect(async () => {
        for await (const _chunk of router.stream(makeRequest())) {
          // consume
        }
      }).rejects.toThrow();
    });
  });

  describe("onUsage", () => {
    it("emits usage events on successful completion", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const events: UsageEvent[] = [];
      router.onUsage((event) => events.push(event));

      await router.complete(makeRequest());

      expect(events).toHaveLength(1);
      expect(events[0]?.provider).toBe("openai");
      expect(events[0]?.usage.inputTokens).toBe(10);
    });

    it("returns a disposer that unsubscribes", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response, response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const events: UsageEvent[] = [];
      const dispose = router.onUsage((event) => events.push(event));

      await router.complete(makeRequest());
      expect(events).toHaveLength(1);

      dispose();
      await router.complete(makeRequest());
      expect(events).toHaveLength(1); // no new events
    });

    it("swallows errors from usage callbacks", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      router.onUsage(() => {
        throw new Error("callback error");
      });

      // Should not throw despite callback error
      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
    });
  });

  describe("getProviderState", () => {
    it("returns circuit breaker state and key info", () => {
      const config = makeConfig();
      const provider = createMockProvider("openai", []);
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const state = router.getProviderState("openai");
      expect(state.circuitBreaker).toBe("closed");
      expect(state.totalKeys).toBe(2);
      expect(state.availableKeys).toBe(2);
    });
  });

  describe("getMetrics", () => {
    it("returns zero metrics for unused provider", () => {
      const config = makeConfig();
      const provider = createMockProvider("openai", []);
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const metrics = router.getMetrics("openai");
      expect(metrics.requestCount).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
    });

    it("tracks latency and request counts", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      await router.complete(makeRequest());

      const metrics = router.getMetrics("openai");
      expect(metrics.requestCount).toBe(1);
      expect(metrics.errorCount).toBe(0);
    });
  });

  describe("stream() - failover actions", () => {
    it("rotates keys on auth failure in stream", async () => {
      const authError = new PermissionError<"MODEL_PROVIDER_AUTH_FAILED">({
        code: "MODEL_PROVIDER_AUTH_FAILED",
        message: "Invalid key",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [authError, response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.stream(makeRequest())) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === "content")).toBe(true);
    });

    it("applies backoff on rate limit in stream", async () => {
      const rateLimitError = new RateLimitError<"MODEL_PROVIDER_RATE_LIMITED">({
        code: "MODEL_PROVIDER_RATE_LIMITED",
        message: "Rate limited",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [rateLimitError, response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.stream(makeRequest())) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === "content")).toBe(true);
    });

    it("applies thinking downgrade on context overflow in stream", async () => {
      const overflowError = new ValidationError<"MODEL_CONTEXT_OVERFLOW">({
        code: "MODEL_CONTEXT_OVERFLOW",
        message: "Context overflow",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [overflowError, response]);
      const config = makeConfig({ thinkingDowngrade: true });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.stream(makeRequest({ thinking: "extended" }))) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === "content")).toBe(true);
    });

    it("falls back to next provider on model_error in stream", async () => {
      const modelError = new ExternalError<"MODEL_PROVIDER_ERROR">({
        code: "MODEL_PROVIDER_ERROR",
        message: "Provider error",
      });
      const response = makeResponse({ provider: "anthropic" });
      const failProvider = createMockProvider("openai", [modelError]);
      const backupProvider = createMockProvider("anthropic", [response]);
      const config = makeConfig({
        providers: {
          openai: { keys: [{ key: "sk-1" }] },
          anthropic: { keys: [{ key: "ak-1" }] },
        },
        fallbackChain: [{ provider: "anthropic", model: "claude-3" }],
      });
      const router = new ModelRouter(
        config,
        new Map([
          ["openai", failProvider],
          ["anthropic", backupProvider],
        ]),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.stream(makeRequest())) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === "content")).toBe(true);
    });
  });

  describe("complete() - billing error", () => {
    it("rotates keys on billing failure", async () => {
      const billingError = new ExternalError<"MODEL_PROVIDER_BILLING_FAILED">({
        code: "MODEL_PROVIDER_BILLING_FAILED",
        message: "Payment required",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [billingError, response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
    });
  });

  describe("complete() - circuit breaker blocks provider", () => {
    it("skips provider when circuit breaker is open", async () => {
      const error = new ExternalError<"MODEL_PROVIDER_ERROR">({
        code: "MODEL_PROVIDER_ERROR",
        message: "Provider error",
      });
      const failProvider = createMockProvider("openai", [error, error, error, error, error, error]);
      const response1 = makeResponse({ provider: "anthropic" });
      const response2 = makeResponse({ provider: "anthropic" });
      const backupProvider = createMockProvider("anthropic", [response1, response2]);

      const config = makeConfig({
        providers: {
          openai: { keys: [{ key: "sk-1" }] },
          anthropic: { keys: [{ key: "ak-1" }] },
        },
        fallbackChain: [{ provider: "anthropic", model: "claude-3" }],
        maxRetries: 0,
        circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 60_000 },
      });
      const router = new ModelRouter(
        config,
        new Map([
          ["openai", failProvider],
          ["anthropic", backupProvider],
        ]),
      );

      // First request: openai fails (CB trips) → falls back to anthropic
      const result1 = await router.complete(makeRequest());
      expect(result1.provider).toBe("anthropic");

      // Second request: openai CB is open, skipped → goes directly to anthropic
      const result2 = await router.complete(makeRequest());
      expect(result2.provider).toBe("anthropic");
    });
  });

  describe("complete() - non-Error lastError", () => {
    it("handles non-Error thrown values in error message", async () => {
      const strangeProvider: ModelProvider = {
        id: "openai",
        async complete() {
          throw "string error";
        },
        // biome-ignore lint/correctness/useYield: test mock throws before yield
        async *stream() {
          throw "string error";
        },
      };
      const config = makeConfig({ maxRetries: 0 });
      const router = new ModelRouter(config, new Map([["openai", strangeProvider]]));

      await expect(router.complete(makeRequest())).rejects.toThrow("All providers failed");
    });
  });

  describe("stream() - abort signal", () => {
    it("respects abort signal in stream", async () => {
      const controller = new AbortController();
      controller.abort();

      const provider = createMockProvider("openai", [makeResponse()]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      await expect(async () => {
        for await (const _chunk of router.stream(makeRequest(), controller.signal)) {
          // consume
        }
      }).rejects.toThrow();
    });
  });

  describe("empty provider map", () => {
    it("throws when no providers can handle the request", async () => {
      const config = makeConfig();
      const router = new ModelRouter(config, new Map());

      await expect(router.complete(makeRequest())).rejects.toThrow("All providers failed");
    });
  });

  describe("provider returns empty content", () => {
    it("returns the response even with empty content", async () => {
      const response = makeResponse({ content: "" });
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig();
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest());
      expect(result.content).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // 3-tier thinking downgrade chain
  // -------------------------------------------------------------------------

  describe("thinking downgrade chain", () => {
    it("downgrades extended → standard on thinking error", async () => {
      const thinkingError = new ExternalError<"MODEL_THINKING_FAILED">({
        code: "MODEL_THINKING_FAILED",
        message: "budget_tokens must be >= 1024",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [thinkingError, response]);
      const config = makeConfig({ thinkingDowngrade: true });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest({ thinking: "extended" }));
      expect(result.content).toBe("Hello!");
      // The second call should have been made with thinking: "standard"
      const calls = (provider as unknown as { _calls: CompletionRequest[] })._calls;
      expect(calls[1]?.thinking).toBe("standard");
    });

    it("downgrades standard → none on second thinking error", async () => {
      const thinkingError = new ExternalError<"MODEL_THINKING_FAILED">({
        code: "MODEL_THINKING_FAILED",
        message: "thinking failed",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [thinkingError, thinkingError, response]);
      const config = makeConfig({ thinkingDowngrade: true });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest({ thinking: "extended" }));
      expect(result.content).toBe("Hello!");
      const calls = (provider as unknown as { _calls: CompletionRequest[] })._calls;
      expect(calls[1]?.thinking).toBe("standard");
      expect(calls[2]?.thinking).toBe("none");
    });

    it("downgrades adaptive → standard → none full chain", async () => {
      const thinkingError = new ExternalError<"MODEL_THINKING_FAILED">({
        code: "MODEL_THINKING_FAILED",
        message: "thinking failed",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [thinkingError, thinkingError, response]);
      const config = makeConfig({ thinkingDowngrade: true });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest({ thinking: "adaptive" }));
      expect(result.content).toBe("Hello!");
      const calls = (provider as unknown as { _calls: CompletionRequest[] })._calls;
      expect(calls[0]?.thinking).toBe("adaptive");
      expect(calls[1]?.thinking).toBe("standard");
      expect(calls[2]?.thinking).toBe("none");
    });

    it("does not downgrade when thinkingDowngrade is false", async () => {
      const thinkingError = new ExternalError<"MODEL_THINKING_FAILED">({
        code: "MODEL_THINKING_FAILED",
        message: "thinking failed",
      });
      const provider = createMockProvider("openai", [thinkingError]);
      const config = makeConfig({ thinkingDowngrade: false, maxRetries: 0 });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      await expect(router.complete(makeRequest({ thinking: "extended" }))).rejects.toThrow();
    });

    it("does not downgrade on non-thinking requests", async () => {
      const thinkingError = new ExternalError<"MODEL_THINKING_FAILED">({
        code: "MODEL_THINKING_FAILED",
        message: "thinking failed",
      });
      const provider = createMockProvider("openai", [thinkingError]);
      const config = makeConfig({ thinkingDowngrade: true, maxRetries: 0 });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      // Request without thinking — already at "none", can't downgrade
      await expect(router.complete(makeRequest())).rejects.toThrow();
    });

    it("downgrades thinking on context_overflow too", async () => {
      const overflowError = new ValidationError<"MODEL_CONTEXT_OVERFLOW">({
        code: "MODEL_CONTEXT_OVERFLOW",
        message: "Context overflow",
      });
      const response = makeResponse();
      const provider = createMockProvider("openai", [overflowError, response]);
      const config = makeConfig({ thinkingDowngrade: true });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest({ thinking: "extended" }));
      expect(result.content).toBe("Hello!");
      const calls = (provider as unknown as { _calls: CompletionRequest[] })._calls;
      expect(calls[1]?.thinking).toBe("standard");
    });
  });

  // -------------------------------------------------------------------------
  // Full Jitter backoff
  // -------------------------------------------------------------------------

  describe("Full Jitter backoff", () => {
    it("respects Retry-After delay from provider", async () => {
      // Create a raw error (non-TemplarError) with retry-after header
      let callCount = 0;
      const rateLimitProvider: ModelProvider = {
        id: "openai",
        async complete(_request: CompletionRequest) {
          if (callCount++ === 0) {
            const err = Object.assign(new Error("rate limited"), {
              status: 429,
              headers: { "retry-after": "0" },
            });
            throw err;
          }
          return makeResponse();
        },
        async *stream() {
          yield { type: "done" as const };
        },
      };

      const config = makeConfig({
        providers: { openai: { keys: [{ key: "sk-1" }, { key: "sk-2" }] } },
        retryBaseDelayMs: 10,
        retryMaxDelayMs: 50,
      });
      const router = new ModelRouter(config, new Map([["openai", rateLimitProvider]]));

      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
    });
  });

  // -------------------------------------------------------------------------
  // onPreModelSelect callback
  // -------------------------------------------------------------------------

  describe("onPreModelSelect callback", () => {
    it("callback receives correct candidates", async () => {
      let receivedCandidates: readonly ModelRef[] = [];
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig({
        onPreModelSelect: (candidates) => {
          receivedCandidates = candidates;
          return candidates;
        },
      });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      await router.complete(makeRequest());
      expect(receivedCandidates.length).toBeGreaterThan(0);
      expect(receivedCandidates[0]?.provider).toBe("openai");
    });

    it("callback can reorder candidates", async () => {
      const response = makeResponse({ provider: "anthropic" });
      const openaiProvider = createMockProvider("openai", []);
      const anthropicProvider = createMockProvider("anthropic", [response]);

      const config = makeConfig({
        providers: {
          openai: { keys: [{ key: "sk-1" }] },
          anthropic: { keys: [{ key: "ak-1" }] },
        },
        fallbackChain: [{ provider: "anthropic", model: "claude-3" }],
        onPreModelSelect: (candidates) => {
          // Reverse the order: anthropic first
          return [...candidates].reverse();
        },
      });

      const router = new ModelRouter(
        config,
        new Map([
          ["openai", openaiProvider],
          ["anthropic", anthropicProvider],
        ]),
      );

      const result = await router.complete(makeRequest());
      expect(result.provider).toBe("anthropic");
    });

    it("callback error is handled gracefully", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig({
        onPreModelSelect: () => {
          throw new Error("callback error");
        },
      });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      // Should not throw — falls back to default chain
      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
    });

    it("absent callback is a no-op", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig(); // no onPreModelSelect
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
    });

    it("falls back to default chain when callback returns empty array", async () => {
      const response = makeResponse();
      const provider = createMockProvider("openai", [response]);
      const config = makeConfig({
        onPreModelSelect: () => [],
      });
      const router = new ModelRouter(config, new Map([["openai", provider]]));

      const result = await router.complete(makeRequest());
      expect(result.content).toBe("Hello!");
    });
  });
});
