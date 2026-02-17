import type {
  LoopDetection,
  LoopDetectionConfig,
  SessionContext,
  TemplarMiddleware,
  TurnContext,
} from "@templar/core";
import { LoopDetectedError } from "@templar/errors";
import { DEFAULT_LOOP_DETECTION, LoopDetector } from "./loop-detector.js";
import { filterDefined } from "./utils.js";

/**
 * Middleware that runs loop detection on every turn.
 *
 * Designed to be used alongside IterationGuard (engine-level hard limits).
 * - IterationGuard: hard cap on iterations (engine layer, non-negotiable)
 * - ExecutionGuardMiddleware: smart loop detection (middleware layer, semantic)
 */
export class ExecutionGuardMiddleware implements TemplarMiddleware {
  readonly name = "templar:execution-guard";
  private detector: LoopDetector;
  private readonly config: LoopDetectionConfig;

  constructor(config?: LoopDetectionConfig) {
    this.config = { ...DEFAULT_LOOP_DETECTION, ...filterDefined(config) };
    this.detector = new LoopDetector(this.config);
  }

  async onSessionStart(_context: SessionContext): Promise<void> {
    // Reset detector for new session
    this.detector = new LoopDetector(this.config);
  }

  async onAfterTurn(context: TurnContext): Promise<void> {
    const output = extractOutputText(context.output);
    const toolCalls = extractToolCalls(context.output);

    const detection = this.detector.recordAndCheck(output, toolCalls);
    if (detection === null) return;

    const onDetected = this.config.onDetected ?? "stop";

    switch (onDetected) {
      case "warn":
        console.warn(
          `[${this.name}] Loop detected at turn ${context.turnNumber}: ${formatDetection(detection)}`,
        );
        break;
      case "stop":
        console.warn(`[${this.name}] Loop detected, stopping: ${formatDetection(detection)}`);
        throw new LoopDetectedError(detection);
      case "error":
        throw new LoopDetectedError(detection);
    }
  }
}

/** Max characters to hash for output comparison (avoids latency on large outputs) */
const MAX_HASH_INPUT = 4096;

/** Extract text content from turn output (handles various output shapes) */
function extractOutputText(output: unknown): string {
  let text: string;
  if (typeof output === "string") {
    text = output;
  } else if (output !== null && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.content === "string") text = obj.content;
    else if (typeof obj.text === "string") text = obj.text;
    else if (typeof obj.message === "string") text = obj.message;
    else text = JSON.stringify(output);
  } else {
    text = JSON.stringify(output ?? "");
  }
  return text.length > MAX_HASH_INPUT ? text.slice(0, MAX_HASH_INPUT) : text;
}

/** Extract tool call names from turn output */
function extractToolCalls(output: unknown): string[] {
  if (output !== null && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (Array.isArray(obj.toolCalls)) {
      return obj.toolCalls
        .filter((tc): tc is Record<string, unknown> => typeof tc === "object" && tc !== null)
        .map((tc) => String(tc.name ?? tc.tool ?? "unknown"));
    }
  }
  return [];
}

function formatDetection(d: LoopDetection): string {
  if (d.type === "tool_cycle") {
    return `tool cycle [${d.cyclePattern?.join(" \u2192 ")}] repeated ${d.repetitions}x`;
  }
  return `identical output repeated ${d.repetitions}x`;
}
