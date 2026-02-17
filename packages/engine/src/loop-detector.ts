import type { LoopDetection, LoopDetectionConfig } from "@templar/core";
import { fnv1a32 } from "./fnv-hash.js";
import { filterDefined } from "./utils.js";

/** Default loop detection configuration */
export const DEFAULT_LOOP_DETECTION: Required<LoopDetectionConfig> = {
  enabled: true,
  windowSize: 5,
  repeatThreshold: 3,
  maxCycleLength: 4,
  onDetected: "stop",
} as const;

/**
 * Composite loop detector: tool call cycle detection + exact output hash.
 *
 * Synchronous — all checks are pure CPU computation. Designed to run
 * inside an async middleware hook (`onAfterTurn`).
 *
 * Two detection strategies:
 * 1. **Tool call cycle**: Detects repeating patterns like
 *    [search, analyze, search, analyze, search, analyze]
 * 2. **Output hash repeat**: Detects identical outputs using FNV-1a fingerprints
 */
export class LoopDetector {
  private readonly config: Required<LoopDetectionConfig>;
  private readonly outputHashes: number[] = [];
  private readonly toolCallHistory: string[] = [];
  private iterationCount = 0;

  constructor(config?: LoopDetectionConfig) {
    this.config = { ...DEFAULT_LOOP_DETECTION, ...filterDefined(config) };

    if (this.config.repeatThreshold < 2) {
      throw new RangeError(`repeatThreshold must be >= 2, got ${this.config.repeatThreshold}`);
    }
    if (this.config.windowSize < 1) {
      throw new RangeError(`windowSize must be >= 1, got ${this.config.windowSize}`);
    }
  }

  /**
   * Record a step's output and tool calls, then check for loops.
   * Returns null if no loop detected, or LoopDetection details.
   */
  recordAndCheck(output: string, toolCalls: readonly string[]): LoopDetection | null {
    if (!this.config.enabled) return null;

    this.iterationCount++;

    // Record output hash (sliding window)
    this.outputHashes.push(fnv1a32(output));
    if (this.outputHashes.length > this.config.windowSize) {
      this.outputHashes.splice(0, this.outputHashes.length - this.config.windowSize);
    }

    // Record tool calls
    for (const tc of toolCalls) {
      this.toolCallHistory.push(tc);
    }
    // Trim tool call history to reasonable bound
    const maxHistory =
      this.config.windowSize * this.config.maxCycleLength * this.config.repeatThreshold;
    if (this.toolCallHistory.length > maxHistory) {
      this.toolCallHistory.splice(0, this.toolCallHistory.length - maxHistory);
    }

    // Short-circuit: not enough data yet
    if (this.iterationCount < this.config.repeatThreshold) return null;

    // Check 1: Tool call cycle detection (catches tool thrashing)
    const cycleResult = this.checkToolCycle();
    if (cycleResult !== null) return cycleResult;

    // Check 2: Exact output hash repetition (catches identical outputs)
    const hashResult = this.checkOutputRepeat();
    if (hashResult !== null) return hashResult;

    return null;
  }

  /** Check for repeating tool call cycles of length 1..maxCycleLength */
  private checkToolCycle(): LoopDetection | null {
    for (let cycleLen = 1; cycleLen <= this.config.maxCycleLength; cycleLen++) {
      const needed = cycleLen * this.config.repeatThreshold;
      if (this.toolCallHistory.length < needed) continue;

      const tail = this.toolCallHistory.slice(-needed);
      const candidate = tail.slice(0, cycleLen);

      let matches = true;
      for (let rep = 1; rep < this.config.repeatThreshold && matches; rep++) {
        const segment = tail.slice(rep * cycleLen, (rep + 1) * cycleLen);
        if (segment.some((v, i) => v !== candidate[i])) {
          matches = false;
        }
      }

      if (matches) {
        return {
          type: "tool_cycle",
          cyclePattern: candidate,
          repetitions: this.config.repeatThreshold,
          windowSize: this.config.windowSize,
        };
      }
    }
    return null;
  }

  /** Check if last `repeatThreshold` output hashes are identical */
  private checkOutputRepeat(): LoopDetection | null {
    if (this.outputHashes.length < this.config.repeatThreshold) return null;

    const recent = this.outputHashes.slice(-this.config.repeatThreshold);
    const first = recent[0];
    if (first !== undefined && recent.every((h) => h === first)) {
      return {
        type: "output_repeat",
        repetitions: this.config.repeatThreshold,
        windowSize: this.config.windowSize,
      };
    }
    return null;
  }

  /** Reset detector state (e.g., between sessions) */
  reset(): void {
    this.outputHashes.length = 0;
    this.toolCallHistory.length = 0;
    this.iterationCount = 0;
  }
}
