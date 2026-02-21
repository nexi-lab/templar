/**
 * Immutable modifier cache with weight cap (Decision 7).
 *
 * Manages a collection of PersonalityModifiers and ensures
 * total weight never exceeds maxDrift. When adding a modifier
 * would exceed the cap, oldest modifiers are evicted first.
 */

import type { PersonalityModifier } from "./types.js";

export class ModifierCache {
  private readonly modifiers: readonly PersonalityModifier[];
  private readonly maxDrift: number;

  constructor(modifiers: readonly PersonalityModifier[], maxDrift: number) {
    this.modifiers = modifiers;
    this.maxDrift = maxDrift;
  }

  /** Create an empty cache with the given drift cap. */
  static empty(maxDrift: number): ModifierCache {
    return new ModifierCache([], maxDrift);
  }

  /** Total weight of all current modifiers. */
  totalWeight(): number {
    let sum = 0;
    for (const mod of this.modifiers) {
      sum += mod.weight;
    }
    return sum;
  }

  /** Number of modifiers currently cached. */
  size(): number {
    return this.modifiers.length;
  }

  /** Get all cached modifiers (readonly). */
  getModifiers(): readonly PersonalityModifier[] {
    return this.modifiers;
  }

  /**
   * Add a modifier, evicting oldest ones if total weight would exceed maxDrift.
   *
   * Returns a NEW ModifierCache (immutable).
   */
  addModifier(modifier: PersonalityModifier): ModifierCache {
    // If the single modifier exceeds maxDrift, skip it entirely
    if (modifier.weight > this.maxDrift) {
      return this;
    }

    // Start with current modifiers sorted by createdAt (oldest first)
    const sorted = [...this.modifiers].sort((a, b) => a.createdAt - b.createdAt);
    const result = [...sorted, modifier];

    // Evict oldest until total weight fits within cap
    let totalWeight = result.reduce((sum, m) => sum + m.weight, 0);
    let startIdx = 0;

    while (totalWeight > this.maxDrift && startIdx < result.length - 1) {
      const evicted = result[startIdx];
      if (evicted !== undefined) {
        totalWeight -= evicted.weight;
      }
      startIdx += 1;
    }

    return new ModifierCache(result.slice(startIdx), this.maxDrift);
  }

  /**
   * Replace all modifiers with a new set, enforcing the weight cap.
   *
   * Keeps newest modifiers that fit within maxDrift.
   * Returns a NEW ModifierCache (immutable).
   */
  replaceAll(modifiers: readonly PersonalityModifier[]): ModifierCache {
    // Sort by createdAt descending (newest first)
    const sorted = [...modifiers].sort((a, b) => b.createdAt - a.createdAt);
    const kept: PersonalityModifier[] = [];
    let totalWeight = 0;

    for (const mod of sorted) {
      if (totalWeight + mod.weight <= this.maxDrift) {
        kept.push(mod);
        totalWeight += mod.weight;
      }
    }

    // Re-sort by createdAt ascending for prompt suffix ordering
    kept.sort((a, b) => a.createdAt - b.createdAt);
    return new ModifierCache(kept, this.maxDrift);
  }

  /**
   * Generate the prompt suffix to inject into the system prompt.
   *
   * Each modifier's text is joined with newlines.
   */
  getPromptSuffix(): string {
    if (this.modifiers.length === 0) return "";

    return this.modifiers.map((m) => m.modifier).join("\n");
  }
}
