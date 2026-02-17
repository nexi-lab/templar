import type { SessionContext, TurnContext } from "@templar/core";
import { LoopDetectedError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { ExecutionGuardMiddleware } from "../execution-guard-middleware.js";

function makeTurnContext(output: unknown, turnNumber = 1): TurnContext {
  return {
    sessionId: "test-session",
    turnNumber,
    output,
    input: "test input",
  } as unknown as TurnContext;
}

function makeSessionContext(): SessionContext {
  return { sessionId: "test-session" } as unknown as SessionContext;
}

describe("ExecutionGuardMiddleware", () => {
  describe("name", () => {
    it("should have correct middleware name", () => {
      const mw = new ExecutionGuardMiddleware();
      expect(mw.name).toBe("templar:execution-guard");
    });
  });

  describe("onAfterTurn — output repeat", () => {
    it("should throw LoopDetectedError on repeated output with onDetected=stop", async () => {
      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "stop",
      });

      // 3 identical outputs
      await mw.onAfterTurn(makeTurnContext("same output", 1));
      await mw.onAfterTurn(makeTurnContext("same output", 2));
      await expect(mw.onAfterTurn(makeTurnContext("same output", 3))).rejects.toThrow(
        LoopDetectedError,
      );
    });

    it("should throw LoopDetectedError on repeated output with onDetected=error", async () => {
      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "error",
      });

      await mw.onAfterTurn(makeTurnContext("same", 1));
      await mw.onAfterTurn(makeTurnContext("same", 2));
      await expect(mw.onAfterTurn(makeTurnContext("same", 3))).rejects.toThrow(LoopDetectedError);
    });

    it("should warn but not throw on repeated output with onDetected=warn", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "warn",
      });

      await mw.onAfterTurn(makeTurnContext("same", 1));
      await mw.onAfterTurn(makeTurnContext("same", 2));
      await mw.onAfterTurn(makeTurnContext("same", 3)); // should not throw

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Loop detected"));

      warnSpy.mockRestore();
    });
  });

  describe("onAfterTurn — tool cycle", () => {
    it("should detect tool cycles", async () => {
      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "error",
      });

      const makeOutput = (tools: string[]) => ({
        content: "response",
        toolCalls: tools.map((name) => ({ name })),
      });

      await mw.onAfterTurn(makeTurnContext(makeOutput(["search"]), 1));
      await mw.onAfterTurn(makeTurnContext(makeOutput(["search"]), 2));
      await expect(mw.onAfterTurn(makeTurnContext(makeOutput(["search"]), 3))).rejects.toThrow(
        LoopDetectedError,
      );
    });
  });

  describe("onSessionStart", () => {
    it("should reset detector on new session", async () => {
      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "error",
      });

      // Build up 2 repeated outputs
      await mw.onAfterTurn(makeTurnContext("same", 1));
      await mw.onAfterTurn(makeTurnContext("same", 2));

      // Start new session — should reset
      await mw.onSessionStart(makeSessionContext());

      // These 2 shouldn't trigger (need 3 after reset)
      await mw.onAfterTurn(makeTurnContext("same", 1));
      await mw.onAfterTurn(makeTurnContext("same", 2));
      // Now this 3rd one should trigger
      await expect(mw.onAfterTurn(makeTurnContext("same", 3))).rejects.toThrow(LoopDetectedError);
    });
  });

  describe("output extraction", () => {
    it("should handle string output", async () => {
      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "error",
      });

      await mw.onAfterTurn(makeTurnContext("text output", 1));
      await mw.onAfterTurn(makeTurnContext("text output", 2));
      await expect(mw.onAfterTurn(makeTurnContext("text output", 3))).rejects.toThrow(
        LoopDetectedError,
      );
    });

    it("should handle { content: string } output", async () => {
      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "error",
      });

      const out = { content: "response text" };
      await mw.onAfterTurn(makeTurnContext(out, 1));
      await mw.onAfterTurn(makeTurnContext(out, 2));
      await expect(mw.onAfterTurn(makeTurnContext(out, 3))).rejects.toThrow(LoopDetectedError);
    });

    it("should handle { text: string } output", async () => {
      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "error",
      });

      const out = { text: "response text" };
      await mw.onAfterTurn(makeTurnContext(out, 1));
      await mw.onAfterTurn(makeTurnContext(out, 2));
      await expect(mw.onAfterTurn(makeTurnContext(out, 3))).rejects.toThrow(LoopDetectedError);
    });

    it("should handle null/undefined output via JSON fallback", async () => {
      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "error",
      });

      await mw.onAfterTurn(makeTurnContext(null, 1));
      await mw.onAfterTurn(makeTurnContext(null, 2));
      await expect(mw.onAfterTurn(makeTurnContext(null, 3))).rejects.toThrow(LoopDetectedError);
    });
  });

  describe("no false positives", () => {
    it("should not trigger for varied outputs", async () => {
      const mw = new ExecutionGuardMiddleware({
        repeatThreshold: 3,
        onDetected: "error",
      });

      await mw.onAfterTurn(makeTurnContext("output 1", 1));
      await mw.onAfterTurn(makeTurnContext("output 2", 2));
      await mw.onAfterTurn(makeTurnContext("output 3", 3));
      await mw.onAfterTurn(makeTurnContext("output 4", 4));
      // No error expected
    });
  });
});
