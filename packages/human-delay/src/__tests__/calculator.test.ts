import { describe, expect, it } from "vitest";
import {
  calculateDelay,
  countPunctuationPauses,
  countWords,
  gaussianRandom,
} from "../calculator.js";
import type { ResolvedConfig } from "../types.js";

// Seeded RNG for deterministic tests
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return (s >>> 0) / 2 ** 32;
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    wpm: 40,
    jitterFactor: 0.2,
    minDelay: 500,
    maxDelay: 8000,
    punctuationPause: true,
    typingRepeatMs: 4000,
    random: seededRng(42),
    clock: globalThis,
    ...overrides,
  };
}

describe("countWords", () => {
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(countWords("   \t\n  ")).toBe(0);
  });

  it("returns 1 for single word", () => {
    expect(countWords("hello")).toBe(1);
  });

  it("returns correct count for multiple words", () => {
    expect(countWords("hello world foo bar")).toBe(4);
  });

  it("handles extra whitespace correctly", () => {
    expect(countWords("  hello   world  ")).toBe(2);
  });

  it("handles newlines and tabs", () => {
    expect(countWords("hello\nworld\tfoo")).toBe(3);
  });
});

describe("gaussianRandom", () => {
  it("returns a finite number", () => {
    const rng = seededRng(1);
    const result = gaussianRandom(rng);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("produces deterministic output with seeded RNG", () => {
    const rng1 = seededRng(42);
    const rng2 = seededRng(42);
    expect(gaussianRandom(rng1)).toBe(gaussianRandom(rng2));
  });

  it("distribution roughly centered at 0 (100 samples)", () => {
    const rng = seededRng(123);
    let sum = 0;
    const n = 100;
    for (let i = 0; i < n; i++) {
      sum += gaussianRandom(rng);
    }
    const mean = sum / n;
    // Mean should be close to 0 (within ±0.5 for 100 samples)
    expect(Math.abs(mean)).toBeLessThan(0.5);
  });

  it("produces varied results with different seeds", () => {
    const a = gaussianRandom(seededRng(1));
    const b = gaussianRandom(seededRng(999));
    expect(a).not.toBe(b);
  });
});

describe("countPunctuationPauses", () => {
  it("counts sentence ends", () => {
    const result = countPunctuationPauses("Hello. World! Really?");
    expect(result.sentenceEnds).toBe(3);
  });

  it("counts clause pauses", () => {
    const result = countPunctuationPauses("one, two; three: four");
    expect(result.clausePauses).toBe(3);
  });

  it("returns 0/0 for no punctuation", () => {
    const result = countPunctuationPauses("hello world");
    expect(result.sentenceEnds).toBe(0);
    expect(result.clausePauses).toBe(0);
  });

  it("handles consecutive punctuation as single group", () => {
    const result = countPunctuationPauses("Wait... Really?!");
    expect(result.sentenceEnds).toBe(2); // "..." and "?!"
  });

  it("handles mixed punctuation", () => {
    const result = countPunctuationPauses("Hello, world. How are you?");
    expect(result.sentenceEnds).toBe(2); // "." and "?"
    expect(result.clausePauses).toBe(1); // ","
  });
});

describe("calculateDelay", () => {
  it("returns minDelay for empty text", () => {
    const config = makeConfig();
    expect(calculateDelay("", config)).toBe(500);
  });

  it("returns minDelay for whitespace-only text", () => {
    const config = makeConfig();
    expect(calculateDelay("   ", config)).toBe(500);
  });

  it("calculates delay based on WPM for 10 words", () => {
    // 10 words at 40 WPM = 15000ms base, with jitter ≈ 15000 ± 20%
    const config = makeConfig({ jitterFactor: 0, punctuationPause: false, maxDelay: 60000 });
    const delay = calculateDelay("one two three four five six seven eight nine ten", config);
    // With jitterFactor=0, gaussianRandom still runs but is multiplied by 0
    expect(delay).toBe(15000);
  });

  it("clamps result to minDelay", () => {
    const config = makeConfig({ minDelay: 1000, wpm: 1000 });
    // 2 words at 1000 WPM = 120ms base, should clamp to 1000
    const delay = calculateDelay("hello world", config);
    expect(delay).toBeGreaterThanOrEqual(1000);
  });

  it("clamps result to maxDelay", () => {
    const config = makeConfig({ maxDelay: 2000, wpm: 1 });
    // 10 words at 1 WPM = 600000ms base, should clamp to 2000
    const delay = calculateDelay("one two three four five six seven eight nine ten", config);
    expect(delay).toBe(2000);
  });

  it("adds extra time for punctuation", () => {
    const config = makeConfig({ jitterFactor: 0 });
    const withPunctuation = calculateDelay("Hello, world.", config);
    const without = makeConfig({ jitterFactor: 0, punctuationPause: false });
    const withoutPunctuation = calculateDelay("Hello, world.", without);
    // Should add 300ms (1 sentence end) + 100ms (1 clause pause)
    expect(withPunctuation).toBe(withoutPunctuation + 400);
  });

  it("skips punctuation pause when disabled", () => {
    const configWith = makeConfig({ jitterFactor: 0, punctuationPause: true });
    const configWithout = makeConfig({ jitterFactor: 0, punctuationPause: false });
    const with_ = calculateDelay("Hello. World!", configWith);
    const without = calculateDelay("Hello. World!", configWithout);
    expect(with_).toBeGreaterThan(without);
  });

  it("jitter produces variation with seeded RNG", () => {
    const config1 = makeConfig({ random: seededRng(1), maxDelay: 60000 });
    const config2 = makeConfig({ random: seededRng(999), maxDelay: 60000 });
    const text = "The quick brown fox jumps over the lazy dog";
    const delay1 = calculateDelay(text, config1);
    const delay2 = calculateDelay(text, config2);
    expect(delay1).not.toBe(delay2);
  });

  it("respects custom WPM", () => {
    const slow = makeConfig({ wpm: 20, jitterFactor: 0, punctuationPause: false, maxDelay: 60000 });
    const fast = makeConfig({ wpm: 80, jitterFactor: 0, punctuationPause: false, maxDelay: 60000 });
    const text = "one two three four";
    // 4 words: slow = 12000ms, fast = 3000ms
    expect(calculateDelay(text, slow)).toBe(12000);
    expect(calculateDelay(text, fast)).toBe(3000);
  });
});
