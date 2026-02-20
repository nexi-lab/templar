/**
 * OTel metrics for skill loading operations.
 *
 * Provides histograms and counters for monitoring skill load performance.
 * Lazily initialized — instruments are only created on first access.
 * When no meter provider is registered, these return no-op instruments.
 */

import type { Counter, Histogram } from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";

const METER_NAME = "templar.skills";

/**
 * Load level for metrics recording.
 */
export type LoadLevel = "metadata" | "content" | "resource";

let _loadDuration: Histogram | undefined;
let _cacheAccess: Counter | undefined;

/**
 * Get the histogram for skill load duration in milliseconds.
 * Records load times per level and skill name.
 * Lazily creates the histogram on first access.
 */
export function getSkillLoadDuration(): Histogram {
  if (_loadDuration === undefined) {
    _loadDuration = metrics.getMeter(METER_NAME).createHistogram("templar.skill.load_duration_ms", {
      description: "Skill load duration in milliseconds per level",
      unit: "ms",
    });
  }
  return _loadDuration;
}

/**
 * Get the counter for cache access tracking.
 * Records hits and misses per cache level.
 * Lazily creates the counter on first access.
 */
export function getSkillCacheAccess(): Counter {
  if (_cacheAccess === undefined) {
    _cacheAccess = metrics.getMeter(METER_NAME).createCounter("templar.skill.cache_access", {
      description: "Skill cache access count (hits and misses)",
    });
  }
  return _cacheAccess;
}

/**
 * Record the load duration for a skill operation.
 */
export function recordLoadTime(level: LoadLevel, skillName: string, durationMs: number): void {
  getSkillLoadDuration().record(durationMs, { level, skill: skillName });
}

/**
 * Record a cache access (hit or miss).
 */
export function recordCacheAccess(level: LoadLevel, hit: boolean): void {
  getSkillCacheAccess().add(1, { level, hit: String(hit) });
}
