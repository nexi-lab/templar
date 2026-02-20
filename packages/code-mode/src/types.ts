/**
 * Code mode configuration types
 */

export interface CodeModeConfig {
  /** Whether code mode is enabled */
  readonly enabled: boolean;
  /** Monty security profile */
  readonly resourceProfile: "strict" | "standard" | "permissive";
  /** Maximum length of generated code (characters) */
  readonly maxCodeLength: number;
  /** Host functions available to generated code */
  readonly hostFunctions: readonly string[];
}

export const DEFAULT_CONFIG: CodeModeConfig = {
  enabled: true,
  resourceProfile: "standard",
  maxCodeLength: 10_000,
  hostFunctions: ["read_file", "search", "memory_query"],
} as const;
