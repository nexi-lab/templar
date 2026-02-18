/**
 * Configuration types for NexusAceMiddleware
 */

/** Reflection mode — controls when post-session reflection is triggered */
export type ReflectionMode = "sync" | "async" | "deferred";

/** Feature flags — opt-in/opt-out for each ACE subsystem */
export interface AceFeatureFlags {
  /** Load playbook strategies at session start (default: true) */
  readonly playbooks?: boolean;
  /** Track execution via trajectories (default: true) */
  readonly trajectory?: boolean;
  /** Inject curated memories at session start (default: true) */
  readonly curation?: boolean;
  /** Post-session LLM reflection (default: false — requires LLM credits) */
  readonly reflection?: boolean;
  /** Periodic memory consolidation (default: false) */
  readonly consolidation?: boolean;
  /** Track feedback signals (default: true) */
  readonly feedback?: boolean;
}

/**
 * Configuration for NexusAceMiddleware
 */
export interface NexusAceConfig {
  /** Feature flags — enable/disable ACE subsystems */
  readonly enabled?: AceFeatureFlags;

  // --- Playbook config ---
  /** Maximum strategies injected into context (default: 10) */
  readonly maxStrategiesInjected?: number;
  /** Minimum confidence threshold for strategy injection (default: 0.6) */
  readonly minStrategyConfidence?: number;
  /** Playbook scope filter (default: "agent") */
  readonly playbookScope?: string;
  /** Timeout for playbook loading at session start in ms (default: 3000) */
  readonly playbookLoadTimeoutMs?: number;

  // --- Trajectory config ---
  /** Number of steps to buffer before flushing (default: 5) */
  readonly stepBufferSize?: number;
  /** Timeout for step flush operations in ms (default: 5000) */
  readonly stepFlushTimeoutMs?: number;

  // --- Reflection config ---
  /** When to trigger reflection (default: "async") */
  readonly reflectionMode?: ReflectionMode;
  /** Timeout for reflection LLM call in ms (default: 10000) */
  readonly reflectionTimeoutMs?: number;

  // --- Curation config ---
  /** Timeout for curation queries in ms (default: 3000) */
  readonly curationQueryTimeoutMs?: number;
  /** Maximum curated memories to inject (default: 5) */
  readonly maxCuratedMemories?: number;

  // --- General ---
  /** Task type label for trajectories (default: "general") */
  readonly taskType?: string;
}

/**
 * Resolved configuration with all defaults applied
 */
export interface ResolvedAceConfig {
  readonly enabled: Required<AceFeatureFlags>;
  readonly maxStrategiesInjected: number;
  readonly minStrategyConfidence: number;
  readonly playbookScope: string;
  readonly playbookLoadTimeoutMs: number;
  readonly stepBufferSize: number;
  readonly stepFlushTimeoutMs: number;
  readonly reflectionMode: ReflectionMode;
  readonly reflectionTimeoutMs: number;
  readonly curationQueryTimeoutMs: number;
  readonly maxCuratedMemories: number;
  readonly taskType: string;
}

/**
 * Default feature flags
 */
export const DEFAULT_FEATURE_FLAGS: Required<AceFeatureFlags> = {
  playbooks: true,
  trajectory: true,
  curation: true,
  reflection: false,
  consolidation: false,
  feedback: true,
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_ACE_CONFIG: ResolvedAceConfig = {
  enabled: DEFAULT_FEATURE_FLAGS,
  maxStrategiesInjected: 10,
  minStrategyConfidence: 0.6,
  playbookScope: "agent",
  playbookLoadTimeoutMs: 3000,
  stepBufferSize: 5,
  stepFlushTimeoutMs: 5000,
  reflectionMode: "async",
  reflectionTimeoutMs: 10000,
  curationQueryTimeoutMs: 3000,
  maxCuratedMemories: 5,
  taskType: "general",
} as const;
