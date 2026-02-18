import { describe, expect, it } from "vitest";
import { TemplarError } from "../base.js";
import { ERROR_CATALOG } from "../catalog.js";
import {
  SpawnChildLimitError,
  SpawnConcurrencyLimitError,
  SpawnDepthExceededError,
  SpawnGovernanceError,
  SpawnToolDeniedError,
} from "../spawn-governance.js";

describe("SpawnGovernanceError hierarchy", () => {
  // -------------------------------------------------------------------------
  // SpawnDepthExceededError
  // -------------------------------------------------------------------------
  describe("SpawnDepthExceededError", () => {
    it("should extend SpawnGovernanceError and TemplarError", () => {
      const error = new SpawnDepthExceededError(3, 2);
      expect(error).toBeInstanceOf(SpawnGovernanceError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should map to catalog entry", () => {
      const error = new SpawnDepthExceededError(3, 2);
      const entry = ERROR_CATALOG.ENGINE_SPAWN_DEPTH_EXCEEDED;
      expect(error.code).toBe("ENGINE_SPAWN_DEPTH_EXCEEDED");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new SpawnDepthExceededError(3, 2);
      expect(error._tag).toBe("SpawnGovernanceError");
    });

    it("should store constructor args", () => {
      const error = new SpawnDepthExceededError(5, 2);
      expect(error.currentDepth).toBe(5);
      expect(error.maxSpawnDepth).toBe(2);
    });

    it("should have descriptive message", () => {
      const error = new SpawnDepthExceededError(3, 2);
      expect(error.message).toBe("Spawn depth 3 exceeds maximum allowed depth 2");
    });

    it("should serialize to JSON", () => {
      const error = new SpawnDepthExceededError(3, 2);
      const json = error.toJSON();
      expect(json.code).toBe("ENGINE_SPAWN_DEPTH_EXCEEDED");
      expect(json._tag).toBe("SpawnGovernanceError");
      expect(json.domain).toBe("engine");
    });

    it("should have HTTP status 429 (Resource Exhausted)", () => {
      const error = new SpawnDepthExceededError(3, 2);
      expect(error.httpStatus).toBe(429);
    });

    it("should have gRPC code RESOURCE_EXHAUSTED", () => {
      const error = new SpawnDepthExceededError(3, 2);
      expect(error.grpcCode).toBe("RESOURCE_EXHAUSTED");
    });
  });

  // -------------------------------------------------------------------------
  // SpawnChildLimitError
  // -------------------------------------------------------------------------
  describe("SpawnChildLimitError", () => {
    it("should extend SpawnGovernanceError and TemplarError", () => {
      const error = new SpawnChildLimitError("agent-1", 5, 5);
      expect(error).toBeInstanceOf(SpawnGovernanceError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should map to catalog entry", () => {
      const error = new SpawnChildLimitError("agent-1", 5, 5);
      const entry = ERROR_CATALOG.ENGINE_SPAWN_CHILD_LIMIT;
      expect(error.code).toBe("ENGINE_SPAWN_CHILD_LIMIT");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new SpawnChildLimitError("agent-1", 5, 5);
      expect(error._tag).toBe("SpawnGovernanceError");
    });

    it("should store constructor args", () => {
      const error = new SpawnChildLimitError("orchestrator", 3, 5);
      expect(error.parentAgentId).toBe("orchestrator");
      expect(error.activeChildren).toBe(3);
      expect(error.maxChildrenPerAgent).toBe(5);
    });

    it("should have descriptive message", () => {
      const error = new SpawnChildLimitError("agent-1", 5, 5);
      expect(error.message).toBe('Parent agent "agent-1" has 5 active children (limit: 5)');
    });

    it("should serialize to JSON", () => {
      const error = new SpawnChildLimitError("agent-1", 5, 5);
      const json = error.toJSON();
      expect(json.code).toBe("ENGINE_SPAWN_CHILD_LIMIT");
      expect(json._tag).toBe("SpawnGovernanceError");
    });
  });

  // -------------------------------------------------------------------------
  // SpawnConcurrencyLimitError
  // -------------------------------------------------------------------------
  describe("SpawnConcurrencyLimitError", () => {
    it("should extend SpawnGovernanceError and TemplarError", () => {
      const error = new SpawnConcurrencyLimitError(8, 8);
      expect(error).toBeInstanceOf(SpawnGovernanceError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should map to catalog entry", () => {
      const error = new SpawnConcurrencyLimitError(8, 8);
      const entry = ERROR_CATALOG.ENGINE_SPAWN_CONCURRENCY_LIMIT;
      expect(error.code).toBe("ENGINE_SPAWN_CONCURRENCY_LIMIT");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new SpawnConcurrencyLimitError(8, 8);
      expect(error._tag).toBe("SpawnGovernanceError");
    });

    it("should store constructor args", () => {
      const error = new SpawnConcurrencyLimitError(10, 8);
      expect(error.activeConcurrent).toBe(10);
      expect(error.maxConcurrent).toBe(8);
    });

    it("should have descriptive message", () => {
      const error = new SpawnConcurrencyLimitError(8, 8);
      expect(error.message).toBe("Concurrent sub-agents (8) reached limit (8)");
    });

    it("should serialize to JSON", () => {
      const error = new SpawnConcurrencyLimitError(8, 8);
      const json = error.toJSON();
      expect(json.code).toBe("ENGINE_SPAWN_CONCURRENCY_LIMIT");
      expect(json._tag).toBe("SpawnGovernanceError");
    });
  });

  // -------------------------------------------------------------------------
  // SpawnToolDeniedError
  // -------------------------------------------------------------------------
  describe("SpawnToolDeniedError", () => {
    it("should extend SpawnGovernanceError and TemplarError", () => {
      const error = new SpawnToolDeniedError("sessions_spawn", 2);
      expect(error).toBeInstanceOf(SpawnGovernanceError);
      expect(error).toBeInstanceOf(TemplarError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should map to catalog entry", () => {
      const error = new SpawnToolDeniedError("sessions_spawn", 2);
      const entry = ERROR_CATALOG.ENGINE_SPAWN_TOOL_DENIED;
      expect(error.code).toBe("ENGINE_SPAWN_TOOL_DENIED");
      expect(error.httpStatus).toBe(entry.httpStatus);
      expect(error.grpcCode).toBe(entry.grpcCode);
      expect(error.domain).toBe(entry.domain);
      expect(error.isExpected).toBe(entry.isExpected);
    });

    it("should have correct _tag discriminant", () => {
      const error = new SpawnToolDeniedError("sessions_spawn", 2);
      expect(error._tag).toBe("SpawnGovernanceError");
    });

    it("should store constructor args", () => {
      const error = new SpawnToolDeniedError("bash", 3);
      expect(error.toolName).toBe("bash");
      expect(error.currentDepth).toBe(3);
    });

    it("should have descriptive message", () => {
      const error = new SpawnToolDeniedError("sessions_spawn", 2);
      expect(error.message).toBe(
        'Tool "sessions_spawn" is denied at spawn depth 2 by depth-aware tool policy',
      );
    });

    it("should serialize to JSON", () => {
      const error = new SpawnToolDeniedError("sessions_spawn", 2);
      const json = error.toJSON();
      expect(json.code).toBe("ENGINE_SPAWN_TOOL_DENIED");
      expect(json._tag).toBe("SpawnGovernanceError");
    });

    it("should have HTTP status 403 (Permission Denied)", () => {
      const error = new SpawnToolDeniedError("sessions_spawn", 2);
      expect(error.httpStatus).toBe(403);
    });

    it("should have gRPC code PERMISSION_DENIED", () => {
      const error = new SpawnToolDeniedError("sessions_spawn", 2);
      expect(error.grpcCode).toBe("PERMISSION_DENIED");
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting instanceof checks
  // -------------------------------------------------------------------------
  describe("instanceof chains", () => {
    it("all spawn errors should be instanceof SpawnGovernanceError", () => {
      const errors = [
        new SpawnDepthExceededError(3, 2),
        new SpawnChildLimitError("p", 5, 5),
        new SpawnConcurrencyLimitError(8, 8),
        new SpawnToolDeniedError("bash", 1),
      ];
      for (const error of errors) {
        expect(error).toBeInstanceOf(SpawnGovernanceError);
      }
    });

    it("all spawn errors should be instanceof TemplarError", () => {
      const errors = [
        new SpawnDepthExceededError(3, 2),
        new SpawnChildLimitError("p", 5, 5),
        new SpawnConcurrencyLimitError(8, 8),
        new SpawnToolDeniedError("bash", 1),
      ];
      for (const error of errors) {
        expect(error).toBeInstanceOf(TemplarError);
      }
    });

    it("all spawn errors should have _tag = SpawnGovernanceError", () => {
      const errors = [
        new SpawnDepthExceededError(3, 2),
        new SpawnChildLimitError("p", 5, 5),
        new SpawnConcurrencyLimitError(8, 8),
        new SpawnToolDeniedError("bash", 1),
      ];
      for (const error of errors) {
        expect(error._tag).toBe("SpawnGovernanceError");
      }
    });
  });
});
