import * as path from "node:path";
import { z } from "zod";
import type {
  Feature,
  FeatureListDocument,
  LongRunningConfig,
  ProgressDocument,
  ProgressEntry,
  ResolvedLongRunningConfig,
} from "./types.js";

// ============================================================================
// CONFIG DEFAULTS
// ============================================================================

const CONFIG_DEFAULTS = {
  maxActiveFeatures: 1,
  progressWindowSize: 10,
  gitTimeoutMs: 30_000,
  featureListPath: "feature-list.json",
  progressFilePath: "progress.json",
  progressArchivePath: "progress-archive.json",
  initScriptPath: "init.sh",
} as const;

// ============================================================================
// PATH SAFETY
// ============================================================================

const safeRelativePathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.includes(".."), { message: "path must not contain '..'" })
  .refine((p) => !path.isAbsolute(p), { message: "path must be relative" });

// ============================================================================
// SCHEMAS
// ============================================================================

const longRunningConfigSchema = z.object({
  workspace: z.string().min(1, { message: "workspace must not be empty" }),
  maxActiveFeatures: z
    .number()
    .int()
    .positive({ message: "maxActiveFeatures must be a positive integer" })
    .optional(),
  progressWindowSize: z
    .number()
    .int()
    .positive({ message: "progressWindowSize must be a positive integer" })
    .optional(),
  gitTimeoutMs: z
    .number()
    .int()
    .positive({ message: "gitTimeoutMs must be a positive integer" })
    .max(300_000, { message: "gitTimeoutMs must not exceed 300000ms" })
    .optional(),
  featureListPath: safeRelativePathSchema.optional(),
  progressFilePath: safeRelativePathSchema.optional(),
  progressArchivePath: safeRelativePathSchema.optional(),
  initScriptPath: safeRelativePathSchema.optional(),
});

const featureCategorySchema = z.enum(["functional", "non-functional", "infrastructure"]);

const featureSchema = z.object({
  id: z.string().min(1, { message: "feature id must not be empty" }),
  category: featureCategorySchema,
  description: z.string().min(1, { message: "feature description must not be empty" }),
  priority: z.number().int().min(0),
  steps: z.array(z.string().min(1)).min(1, {
    message: "feature must have at least one step",
  }),
  passes: z.boolean(),
});

const featureListDocumentSchema = z.object({
  features: z.array(featureSchema).min(1, {
    message: "feature list must have at least one feature",
  }),
  createdAt: z.string().datetime({ message: "createdAt must be ISO 8601" }),
  lastUpdatedAt: z.string().datetime({ message: "lastUpdatedAt must be ISO 8601" }),
});

const progressEntrySchema = z.object({
  sessionNumber: z.number().int().positive(),
  timestamp: z.string().datetime({ message: "timestamp must be ISO 8601" }),
  whatWasDone: z.string().min(1),
  currentState: z.string().min(1),
  nextSteps: z.string().min(1),
  gitCommits: z.array(z.string()),
  featuresCompleted: z.array(z.string()),
});

const progressDocumentSchema = z.object({
  entries: z.array(progressEntrySchema),
});

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Validate a LongRunningConfig, returning the parsed result or throwing ZodError.
 */
export function validateLongRunningConfig(config: unknown): LongRunningConfig {
  return longRunningConfigSchema.parse(config) as LongRunningConfig;
}

/**
 * Resolve config by applying defaults to validated config.
 */
export function resolveConfig(config: LongRunningConfig): ResolvedLongRunningConfig {
  return {
    workspace: config.workspace,
    maxActiveFeatures: config.maxActiveFeatures ?? CONFIG_DEFAULTS.maxActiveFeatures,
    progressWindowSize: config.progressWindowSize ?? CONFIG_DEFAULTS.progressWindowSize,
    gitTimeoutMs: config.gitTimeoutMs ?? CONFIG_DEFAULTS.gitTimeoutMs,
    featureListPath: config.featureListPath ?? CONFIG_DEFAULTS.featureListPath,
    progressFilePath: config.progressFilePath ?? CONFIG_DEFAULTS.progressFilePath,
    progressArchivePath: config.progressArchivePath ?? CONFIG_DEFAULTS.progressArchivePath,
    initScriptPath: config.initScriptPath ?? CONFIG_DEFAULTS.initScriptPath,
  };
}

/**
 * Validate a Feature, returning the parsed result or throwing ZodError.
 */
export function validateFeature(feature: unknown): Feature {
  return featureSchema.parse(feature) as Feature;
}

/**
 * Validate a FeatureListDocument, returning the parsed result or throwing ZodError.
 */
export function validateFeatureListDocument(doc: unknown): FeatureListDocument {
  return featureListDocumentSchema.parse(doc) as FeatureListDocument;
}

/**
 * Validate a ProgressEntry, returning the parsed result or throwing ZodError.
 */
export function validateProgressEntry(entry: unknown): ProgressEntry {
  return progressEntrySchema.parse(entry) as ProgressEntry;
}

/**
 * Validate a ProgressDocument, returning the parsed result or throwing ZodError.
 */
export function validateProgressDocument(doc: unknown): ProgressDocument {
  return progressDocumentSchema.parse(doc) as ProgressDocument;
}
