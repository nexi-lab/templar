import { describe, expect, it } from "vitest";
import { INTERCEPTOR_EVENTS } from "../constants.js";
import { HookRegistry } from "../registry.js";
import type {
  HookEvent,
  InterceptorEventMap,
  IterationWarningData,
  LoopDetectedData,
  ObserverEventMap,
} from "../types.js";

describe("Loop detection hook events (#151)", () => {
  describe("LoopDetected interceptor", () => {
    it("should be listed in INTERCEPTOR_EVENTS", () => {
      expect(INTERCEPTOR_EVENTS).toContain("LoopDetected");
    });

    it("should exist in InterceptorEventMap", () => {
      // Type-level check: LoopDetected is a key of InterceptorEventMap
      const _check: keyof InterceptorEventMap = "LoopDetected";
      expect(_check).toBe("LoopDetected");
    });

    it("should be a valid HookEvent", () => {
      const event: HookEvent = "LoopDetected";
      expect(event).toBe("LoopDetected");
    });

    it("should support continue action (override false positive)", () => {
      const registry = new HookRegistry();
      let handlerCalled = false;

      registry.on("LoopDetected", (_data) => {
        handlerCalled = true;
        return { action: "continue" as const };
      });

      const data: LoopDetectedData = {
        sessionId: "session-1",
        detection: {
          type: "tool_cycle",
          cyclePattern: ["search", "analyze"],
          repetitions: 3,
          windowSize: 5,
        },
        iterationCount: 15,
        onDetected: "stop",
      };

      // Emit returns a promise — handler should be called
      const result = registry.emit("LoopDetected", data);
      expect(result).toBeInstanceOf(Promise);
      expect(handlerCalled).toBe(true);
    });

    it("should support block action (confirm loop)", () => {
      const registry = new HookRegistry();

      registry.on("LoopDetected", (_data) => {
        return { action: "block" as const, reason: "Confirmed loop" };
      });

      const data: LoopDetectedData = {
        sessionId: "session-1",
        detection: {
          type: "output_repeat",
          repetitions: 3,
          windowSize: 5,
        },
        iterationCount: 10,
        onDetected: "error",
      };

      const result = registry.emit("LoopDetected", data);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("IterationWarning observer", () => {
    it("should exist in ObserverEventMap", () => {
      const _check: keyof ObserverEventMap = "IterationWarning";
      expect(_check).toBe("IterationWarning");
    });

    it("should NOT be in INTERCEPTOR_EVENTS (it is observe-only)", () => {
      expect(INTERCEPTOR_EVENTS).not.toContain("IterationWarning");
    });

    it("should be a valid HookEvent", () => {
      const event: HookEvent = "IterationWarning";
      expect(event).toBe("IterationWarning");
    });

    it("should fire observer handler with correct data", () => {
      const registry = new HookRegistry();
      let receivedData: IterationWarningData | undefined;

      registry.on("IterationWarning", (data) => {
        receivedData = data as IterationWarningData;
      });

      const data: IterationWarningData = {
        sessionId: "session-1",
        iterationCount: 20,
        maxIterations: 25,
        percentage: 80,
      };

      registry.emit("IterationWarning", data);

      expect(receivedData).toBeDefined();
      expect(receivedData?.iterationCount).toBe(20);
      expect(receivedData?.maxIterations).toBe(25);
      expect(receivedData?.percentage).toBe(80);
    });
  });

  describe("event count", () => {
    it("should have 8 interceptor events (was 7, added PreSubagentSpawn)", () => {
      expect(INTERCEPTOR_EVENTS).toHaveLength(8);
    });
  });
});
