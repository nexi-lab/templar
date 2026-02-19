/**
 * Shared test helpers for context hydration tests (#59).
 */

import type { SessionContext, ToolExecutor } from "@templar/core";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { vi } from "vitest";

/**
 * Create a mock ToolExecutor for testing MCP tool resolution.
 */
export function createMockToolExecutor(): {
  executor: ToolExecutor;
  executeFn: ReturnType<typeof vi.fn>;
} {
  const executeFn = vi.fn();
  const executor: ToolExecutor = {
    execute: executeFn,
  };
  return { executor, executeFn };
}

/**
 * Create a test SessionContext with sensible defaults.
 */
export function createTestSessionContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: "test-session-1",
    agentId: "test-agent",
    userId: "test-user",
    metadata: {},
    ...overrides,
  };
}

/**
 * Re-export for convenience.
 */
export { createMockNexusClient, type MockNexusClient };
