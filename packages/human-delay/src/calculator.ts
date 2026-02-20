import type { ResolvedConfig } from "./types.js";

/** Count words in text (split on whitespace) */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** Box-Muller transform: uniform [0,1) → Gaussian (mean=0, stddev=1) */
export function gaussianRandom(random: () => number): number {
  const u1 = random();
  const u2 = random();
  // Clamp u1 away from 0 to avoid log(0)
  const safeU1 = Math.max(u1, 1e-10);
  return Math.sqrt(-2 * Math.log(safeU1)) * Math.cos(2 * Math.PI * u2);
}

/** Count punctuation-based pause triggers */
export function countPunctuationPauses(text: string): {
  sentenceEnds: number;
  clausePauses: number;
} {
  const sentenceEnds = (text.match(/[.!?]+/g) ?? []).length;
  const clausePauses = (text.match(/[,;:]+/g) ?? []).length;
  return { sentenceEnds, clausePauses };
}

/** Calculate delay for a text message */
export function calculateDelay(text: string, config: ResolvedConfig): number {
  const words = countWords(text);
  if (words === 0) return config.minDelay;

  // Base delay: time to type at target WPM
  const baseMs = (words / config.wpm) * 60_000;

  // Gaussian jitter: ±jitterFactor variation
  const jitter = 1 + gaussianRandom(config.random) * config.jitterFactor;
  let delayMs = baseMs * jitter;

  // Punctuation pauses
  if (config.punctuationPause) {
    const { sentenceEnds, clausePauses } = countPunctuationPauses(text);
    delayMs += sentenceEnds * 300; // 300ms per sentence end
    delayMs += clausePauses * 100; // 100ms per clause pause
  }

  // Clamp to [minDelay, maxDelay]
  return Math.max(config.minDelay, Math.min(config.maxDelay, Math.round(delayMs)));
}
