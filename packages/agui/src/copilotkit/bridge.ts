/**
 * CopilotKit Bridge
 *
 * Creates agent configuration compatible with CopilotKit's
 * CustomHttpAgent. Points CopilotKit at the AG-UI SSE server.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopilotKitAgentInput {
  /** Agent name used by CopilotKit for routing. */
  readonly name: string;
  /** AG-UI server hostname. Defaults to "127.0.0.1". */
  readonly hostname?: string;
  /** AG-UI server port. Defaults to 18790. */
  readonly port?: number;
  /** Optional human-readable description of this agent. */
  readonly description?: string;
}

export interface CopilotKitAgentConfig {
  /** Agent name used by CopilotKit for routing. */
  readonly name: string;
  /** Full URL to the AG-UI SSE endpoint. */
  readonly url: string;
  /** Optional description. */
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_PORT = 18790;

/**
 * Creates a CopilotKit-compatible agent configuration that
 * points to a Templar AG-UI SSE server.
 *
 * Usage with CopilotKit:
 * ```ts
 * import { CopilotRuntime, CustomHttpAgent } from "@copilotkit/runtime";
 * import { createCopilotKitAgent } from "@templar/agui";
 *
 * const config = createCopilotKitAgent({ name: "templar" });
 * const agent = new CustomHttpAgent(config);
 * const runtime = new CopilotRuntime({ agents: { [config.name]: agent } });
 * ```
 */
export function createCopilotKitAgent(input: CopilotKitAgentInput): CopilotKitAgentConfig {
  const hostname = input.hostname ?? DEFAULT_HOSTNAME;
  const port = input.port ?? DEFAULT_PORT;

  return {
    name: input.name,
    url: `http://${hostname}:${port}`,
    ...(input.description !== undefined ? { description: input.description } : {}),
  };
}
