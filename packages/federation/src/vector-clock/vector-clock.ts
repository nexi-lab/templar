/**
 * Immutable vector clock for causal ordering in distributed systems.
 *
 * Each node maintains a logical counter. Comparing two clocks reveals
 * whether events are causally ordered (BEFORE / AFTER) or concurrent.
 *
 * All mutation methods return a **new** VectorClock instance —
 * the original is never modified.
 */

import type { CausalOrder } from "@templar/core";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** JSON-serialisable representation of a vector clock */
export type VectorClockJSON = Record<string, number>;

// ---------------------------------------------------------------------------
// VectorClock
// ---------------------------------------------------------------------------

export class VectorClock {
  private readonly entries: ReadonlyMap<string, number>;

  // -----------------------------------------------------------------------
  // Construction (private — use static factories)
  // -----------------------------------------------------------------------

  private constructor(entries: ReadonlyMap<string, number>) {
    this.entries = entries;
    Object.freeze(this);
  }

  // -----------------------------------------------------------------------
  // Static factories
  // -----------------------------------------------------------------------

  /** Create an empty vector clock. */
  static create(): VectorClock {
    return new VectorClock(new Map());
  }

  /** Reconstruct a vector clock from its JSON representation. */
  static fromJSON(json: VectorClockJSON): VectorClock {
    const entries = new Map<string, number>();
    for (const [nodeId, counter] of Object.entries(json)) {
      if (typeof counter !== "number" || counter < 0 || !Number.isInteger(counter)) {
        throw new TypeError(
          `Invalid counter for node '${nodeId}': expected non-negative integer, got ${String(counter)}`,
        );
      }
      if (counter > 0) {
        entries.set(nodeId, counter);
      }
    }
    return new VectorClock(entries);
  }

  // -----------------------------------------------------------------------
  // Mutation (returns new instance)
  // -----------------------------------------------------------------------

  /** Increment the counter for `nodeId` and return a new clock. */
  increment(nodeId: string): VectorClock {
    const next = new Map(this.entries);
    next.set(nodeId, (this.entries.get(nodeId) ?? 0) + 1);
    return new VectorClock(next);
  }

  /** Merge with another clock, taking the max of each counter. */
  merge(other: VectorClock): VectorClock {
    const merged = new Map(this.entries);
    for (const [nodeId, counter] of other.entries) {
      const current = merged.get(nodeId) ?? 0;
      if (counter > current) {
        merged.set(nodeId, counter);
      }
    }
    return new VectorClock(merged);
  }

  // -----------------------------------------------------------------------
  // Comparison
  // -----------------------------------------------------------------------

  /** Compare causal ordering with another vector clock. */
  compare(other: VectorClock): CausalOrder {
    const allNodes = new Set([...this.entries.keys(), ...other.entries.keys()]);

    let thisAhead = false;
    let otherAhead = false;

    for (const nodeId of allNodes) {
      const a = this.entries.get(nodeId) ?? 0;
      const b = other.entries.get(nodeId) ?? 0;

      if (a > b) {
        thisAhead = true;
      } else if (b > a) {
        otherAhead = true;
      }

      // Short-circuit: if both are ahead on different nodes → CONCURRENT
      if (thisAhead && otherAhead) {
        return "CONCURRENT";
      }
    }

    if (thisAhead) return "AFTER";
    if (otherAhead) return "BEFORE";
    return "EQUAL";
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Get the counter for a specific node (0 if absent). */
  get(nodeId: string): number {
    return this.entries.get(nodeId) ?? 0;
  }

  /** Get all node IDs in this clock. */
  get nodeIds(): ReadonlySet<string> {
    return new Set(this.entries.keys());
  }

  /** Number of nodes tracked. */
  get size(): number {
    return this.entries.size;
  }

  /** Whether the clock is empty (no entries). */
  get isEmpty(): boolean {
    return this.entries.size === 0;
  }

  // -----------------------------------------------------------------------
  // Serialisation
  // -----------------------------------------------------------------------

  /** Convert to a JSON-serialisable record. */
  toJSON(): VectorClockJSON {
    const result: Record<string, number> = {};
    for (const [nodeId, counter] of this.entries) {
      result[nodeId] = counter;
    }
    return result;
  }

  /** Human-readable representation for logging. */
  toString(): string {
    if (this.entries.size === 0) return "VectorClock({})";
    const pairs = [...this.entries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    return `VectorClock({${pairs}})`;
  }
}
