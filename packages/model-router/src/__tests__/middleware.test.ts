import type { TurnContext } from "@templar/core";
import { describe, expect, it } from "vitest";
import { ModelRouterMiddleware } from "../middleware.js";
import { ModelRouter } from "../router.js";
import type { CompletionResponse, ModelProvider, ModelRef } from "../types.js";

function makeResponse(): CompletionResponse {
  return {
    content: "Hello!",
    model: "gpt-4o",
    provider: "openai",
    usage: { inputTokens: 10, outputTokens: 20 },
    finishReason: "stop",
    raw: null,
  };
}

function createMockProvider(responses: Array<CompletionResponse>): ModelProvider {
  let callIndex = 0;
  return {
    id: "openai",
    async complete() {
      const resp = responses[callIndex++];
      if (!resp) throw new Error("No response");
      return resp;
    },
    async *stream() {
      const resp = responses[callIndex++];
      if (!resp) throw new Error("No response");
      yield { type: "content" as const, content: resp.content };
      yield { type: "done" as const };
    },
  };
}

function makeTurnContext(overrides?: Partial<TurnContext>): TurnContext {
  return {
    sessionId: "test-session",
    turnNumber: 1,
    metadata: {},
    ...overrides,
  };
}

describe("ModelRouterMiddleware", () => {
  it("has name 'model-router'", () => {
    const router = new ModelRouter(
      {
        providers: { openai: { keys: [{ key: "sk-1" }] } },
        defaultModel: { provider: "openai", model: "gpt-4o" },
      },
      new Map([["openai", createMockProvider([makeResponse()])]]),
    );
    const middleware = new ModelRouterMiddleware(router);
    expect(middleware.name).toBe("model-router");
  });

  it("injects router reference into turn metadata on onBeforeTurn", async () => {
    const provider = createMockProvider([makeResponse()]);
    const router = new ModelRouter(
      {
        providers: { openai: { keys: [{ key: "sk-1" }] } },
        defaultModel: { provider: "openai", model: "gpt-4o" },
      },
      new Map([["openai", provider]]),
    );
    const middleware = new ModelRouterMiddleware(router);
    const context = makeTurnContext();

    await middleware.onBeforeTurn(context);
    expect(context.metadata?.modelRouter).toBe(router);
  });

  it("initializes metadata if not present", async () => {
    const provider = createMockProvider([makeResponse()]);
    const router = new ModelRouter(
      {
        providers: { openai: { keys: [{ key: "sk-1" }] } },
        defaultModel: { provider: "openai", model: "gpt-4o" },
      },
      new Map([["openai", provider]]),
    );
    const middleware = new ModelRouterMiddleware(router);
    const context: TurnContext = {
      sessionId: "test",
      turnNumber: 1,
    };

    await middleware.onBeforeTurn(context);
    expect(context.metadata).toBeDefined();
    expect(context.metadata?.modelRouter).toBe(router);
  });

  it("cleans up internal tracking keys on onAfterTurn", async () => {
    const provider = createMockProvider([makeResponse()]);
    const router = new ModelRouter(
      {
        providers: { openai: { keys: [{ key: "sk-1" }] } },
        defaultModel: { provider: "openai", model: "gpt-4o" },
      },
      new Map([["openai", provider]]),
    );
    const middleware = new ModelRouterMiddleware(router);
    const context = makeTurnContext();

    await middleware.onBeforeTurn(context);
    expect(context.metadata?.["modelRouter:usageDispose"]).toBeDefined();

    await middleware.onAfterTurn(context);
    expect(context.metadata?.["modelRouter:usageDispose"]).toBeUndefined();
    expect(context.metadata?.["modelRouter:turnUsage"]).toBeUndefined();
  });

  it("collects usage events during a turn", async () => {
    const response = makeResponse();
    const provider = createMockProvider([response]);
    const router = new ModelRouter(
      {
        providers: { openai: { keys: [{ key: "sk-1" }] } },
        defaultModel: { provider: "openai", model: "gpt-4o" },
      },
      new Map([["openai", provider]]),
    );
    const middleware = new ModelRouterMiddleware(router);
    const context = makeTurnContext();

    await middleware.onBeforeTurn(context);

    // Use the router during the turn
    await router.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    await middleware.onAfterTurn(context);

    // Usage should be captured
    const usage = context.metadata?.["modelRouter:usage"];
    expect(Array.isArray(usage)).toBe(true);
    expect((usage as unknown[]).length).toBe(1);
  });

  it("onPreModelSelect callback fires through router config", async () => {
    let hookCalled = false;
    const response = makeResponse();
    const provider = createMockProvider([response]);
    const router = new ModelRouter(
      {
        providers: { openai: { keys: [{ key: "sk-1" }] } },
        defaultModel: { provider: "openai", model: "gpt-4o" },
        onPreModelSelect: (candidates: readonly ModelRef[]) => {
          hookCalled = true;
          return candidates;
        },
      },
      new Map([["openai", provider]]),
    );
    const middleware = new ModelRouterMiddleware(router);
    const context = makeTurnContext();

    await middleware.onBeforeTurn(context);
    await router.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });
    await middleware.onAfterTurn(context);

    expect(hookCalled).toBe(true);
  });
});
