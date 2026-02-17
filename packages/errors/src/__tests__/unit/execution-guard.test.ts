import { describe, expect, it } from "vitest";
import {
  ExecutionGuardError,
  ExecutionTimeoutError,
  IterationLimitError,
  LoopDetectedError,
  TemplarError,
} from "../../index.js";

describe("ExecutionGuardError hierarchy", () => {
  describe("IterationLimitError", () => {
    it("should carry iteration count and max", () => {
      const error = new IterationLimitError(26, 25);
      expect(error.iterationCount).toBe(26);
      expect(error.maxIterations).toBe(25);
    });

    it("should have correct error code", () => {
      const error = new IterationLimitError(10, 10);
      expect(error.code).toBe("ENGINE_ITERATION_LIMIT");
    });

    it("should include counts in message", () => {
      const error = new IterationLimitError(26, 25);
      expect(error.message).toContain("26");
      expect(error.message).toContain("25");
    });

    it("should be instanceof ExecutionGuardError", () => {
      const error = new IterationLimitError(10, 10);
      expect(error).toBeInstanceOf(ExecutionGuardError);
    });

    it("should be instanceof TemplarError", () => {
      const error = new IterationLimitError(10, 10);
      expect(error).toBeInstanceOf(TemplarError);
    });

    it("should have expected HTTP status 429", () => {
      const error = new IterationLimitError(10, 10);
      expect(error.httpStatus).toBe(429);
    });

    it("should be marked as expected", () => {
      const error = new IterationLimitError(10, 10);
      expect(error.isExpected).toBe(true);
    });
  });

  describe("LoopDetectedError", () => {
    it("should carry tool_cycle detection details", () => {
      const detection = {
        type: "tool_cycle" as const,
        cyclePattern: ["search", "analyze"],
        repetitions: 3,
        windowSize: 5,
      };
      const error = new LoopDetectedError(detection);
      expect(error.detection).toEqual(detection);
    });

    it("should carry output_repeat detection details", () => {
      const detection = {
        type: "output_repeat" as const,
        repetitions: 3,
        windowSize: 5,
      };
      const error = new LoopDetectedError(detection);
      expect(error.detection).toEqual(detection);
    });

    it("should have correct error code", () => {
      const error = new LoopDetectedError({
        type: "tool_cycle",
        cyclePattern: ["search"],
        repetitions: 3,
        windowSize: 5,
      });
      expect(error.code).toBe("ENGINE_LOOP_DETECTED");
    });

    it("should format tool_cycle message with arrow separators", () => {
      const error = new LoopDetectedError({
        type: "tool_cycle",
        cyclePattern: ["search", "analyze"],
        repetitions: 3,
        windowSize: 5,
      });
      expect(error.message).toContain("search");
      expect(error.message).toContain("analyze");
      expect(error.message).toContain("3x");
    });

    it("should format output_repeat message", () => {
      const error = new LoopDetectedError({
        type: "output_repeat",
        repetitions: 4,
        windowSize: 5,
      });
      expect(error.message).toContain("identical output");
      expect(error.message).toContain("4x");
    });

    it("should be instanceof ExecutionGuardError", () => {
      const error = new LoopDetectedError({
        type: "output_repeat",
        repetitions: 3,
        windowSize: 5,
      });
      expect(error).toBeInstanceOf(ExecutionGuardError);
    });

    it("should be instanceof TemplarError", () => {
      const error = new LoopDetectedError({
        type: "output_repeat",
        repetitions: 3,
        windowSize: 5,
      });
      expect(error).toBeInstanceOf(TemplarError);
    });

    it("should have HTTP status 409", () => {
      const error = new LoopDetectedError({
        type: "output_repeat",
        repetitions: 3,
        windowSize: 5,
      });
      expect(error.httpStatus).toBe(409);
    });
  });

  describe("ExecutionTimeoutError", () => {
    it("should carry elapsed and max times", () => {
      const error = new ExecutionTimeoutError(125_000, 120_000);
      expect(error.elapsedMs).toBe(125_000);
      expect(error.maxMs).toBe(120_000);
    });

    it("should have correct error code", () => {
      const error = new ExecutionTimeoutError(1000, 500);
      expect(error.code).toBe("ENGINE_EXECUTION_TIMEOUT");
    });

    it("should include times in message", () => {
      const error = new ExecutionTimeoutError(125_000, 120_000);
      expect(error.message).toContain("125000");
      expect(error.message).toContain("120000");
    });

    it("should be instanceof ExecutionGuardError", () => {
      const error = new ExecutionTimeoutError(1000, 500);
      expect(error).toBeInstanceOf(ExecutionGuardError);
    });

    it("should be instanceof TemplarError", () => {
      const error = new ExecutionTimeoutError(1000, 500);
      expect(error).toBeInstanceOf(TemplarError);
    });

    it("should have HTTP status 504", () => {
      const error = new ExecutionTimeoutError(1000, 500);
      expect(error.httpStatus).toBe(504);
    });

    it("should not be marked as expected", () => {
      const error = new ExecutionTimeoutError(1000, 500);
      expect(error.isExpected).toBe(false);
    });
  });

  describe("generic ExecutionGuardError catch", () => {
    it("should catch all guard errors with instanceof ExecutionGuardError", () => {
      const errors: ExecutionGuardError[] = [
        new IterationLimitError(10, 10),
        new LoopDetectedError({ type: "output_repeat", repetitions: 3, windowSize: 5 }),
        new ExecutionTimeoutError(1000, 500),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(ExecutionGuardError);
        expect(error).toBeInstanceOf(TemplarError);
        expect(error).toBeInstanceOf(Error);
      }
    });

    it("should distinguish between specific error types", () => {
      const error: ExecutionGuardError = new IterationLimitError(10, 10);

      expect(error).toBeInstanceOf(IterationLimitError);
      expect(error).not.toBeInstanceOf(LoopDetectedError);
      expect(error).not.toBeInstanceOf(ExecutionTimeoutError);
    });
  });
});
