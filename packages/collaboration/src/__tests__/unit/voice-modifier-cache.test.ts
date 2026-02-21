import { describe, expect, it } from "vitest";
import { ModifierCache } from "../../voice/modifier-cache.js";
import type { PersonalityModifier } from "../../voice/types.js";

function mod(weight: number, text = "test", createdAt = Date.now()): PersonalityModifier {
  return { source: "test", modifier: text, weight, createdAt };
}

describe("ModifierCache", () => {
  it("should create empty cache", () => {
    const cache = ModifierCache.empty(0.5);
    expect(cache.size()).toBe(0);
    expect(cache.totalWeight()).toBe(0);
    expect(cache.getPromptSuffix()).toBe("");
  });

  it("should add modifier within weight cap", () => {
    const cache = ModifierCache.empty(0.5);
    const updated = cache.addModifier(mod(0.2));
    expect(updated.size()).toBe(1);
    expect(updated.totalWeight()).toBeCloseTo(0.2);
  });

  it("should evict oldest when exceeding weight cap", () => {
    let cache = ModifierCache.empty(0.3);
    cache = cache.addModifier(mod(0.15, "first", 1000));
    cache = cache.addModifier(mod(0.15, "second", 2000));
    // Total: 0.30 — at cap

    // Adding another should evict the oldest
    cache = cache.addModifier(mod(0.15, "third", 3000));
    expect(cache.size()).toBe(2);
    expect(cache.totalWeight()).toBeCloseTo(0.3);
    // "first" should have been evicted
    const modifiers = cache.getModifiers();
    expect(modifiers.some((m) => m.modifier === "first")).toBe(false);
    expect(modifiers.some((m) => m.modifier === "second")).toBe(true);
    expect(modifiers.some((m) => m.modifier === "third")).toBe(true);
  });

  it("should skip modifier that exceeds maxDrift on its own", () => {
    const cache = ModifierCache.empty(0.1);
    const updated = cache.addModifier(mod(0.5));
    expect(updated.size()).toBe(0); // Skipped — weight > maxDrift
  });

  it("should be immutable — original unchanged after addModifier", () => {
    const original = ModifierCache.empty(0.5);
    const updated = original.addModifier(mod(0.2));
    expect(original.size()).toBe(0);
    expect(updated.size()).toBe(1);
  });

  it("should replaceAll with weight cap", () => {
    const cache = ModifierCache.empty(0.3);
    const modifiers = [
      mod(0.15, "a", 1000),
      mod(0.15, "b", 2000),
      mod(0.15, "c", 3000),
    ];
    const replaced = cache.replaceAll(modifiers);
    // Can only fit 2 modifiers (0.30 cap)
    expect(replaced.size()).toBe(2);
    expect(replaced.totalWeight()).toBeCloseTo(0.3);
    // Should keep newest: b and c
    const kept = replaced.getModifiers();
    expect(kept.some((m) => m.modifier === "c")).toBe(true);
    expect(kept.some((m) => m.modifier === "b")).toBe(true);
  });

  it("should replaceAll with empty array", () => {
    let cache = ModifierCache.empty(0.5);
    cache = cache.addModifier(mod(0.2));
    const replaced = cache.replaceAll([]);
    expect(replaced.size()).toBe(0);
  });

  it("should generate prompt suffix from modifiers", () => {
    let cache = ModifierCache.empty(1.0);
    cache = cache.addModifier(mod(0.1, "Be friendly", 1000));
    cache = cache.addModifier(mod(0.1, "Use formal language", 2000));

    const suffix = cache.getPromptSuffix();
    expect(suffix).toBe("Be friendly\nUse formal language");
  });

  it("should handle maxDrift of 0 (no modifiers allowed)", () => {
    const cache = ModifierCache.empty(0);
    const updated = cache.addModifier(mod(0.1));
    expect(updated.size()).toBe(0);
  });

  it("should handle maxDrift of 1 (unlimited)", () => {
    let cache = ModifierCache.empty(1.0);
    for (let i = 0; i < 10; i++) {
      cache = cache.addModifier(mod(0.05, `mod-${i}`, i * 1000));
    }
    expect(cache.size()).toBe(10);
    expect(cache.totalWeight()).toBeCloseTo(0.5);
  });
});
