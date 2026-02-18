import { z } from "zod";
import type { ResolvedSelfTestConfig, SelfTestConfig } from "./types.js";

// ============================================================================
// CONFIG DEFAULTS
// ============================================================================

const CONFIG_DEFAULTS = {
  maxTotalDurationMs: 300_000,
  devServer: {
    timeoutMs: 30_000,
    reuseExisting: true,
  },
  health: {
    timeoutMs: 5_000,
    expectedStatus: 200,
  },
  smoke: {
    timeoutMs: 30_000,
  },
  browser: {
    timeoutMs: 120_000,
    viewport: { width: 1280, height: 720 },
    screenshotOnFailure: true,
  },
  api: {
    timeoutMs: 30_000,
  },
  screenshots: {
    storage: "base64" as const,
    directory: ".self-test/screenshots",
    onPass: "never" as const,
    onFail: "always" as const,
  },
  report: {
    outputPath: ".self-test/reports",
    includeScreenshots: true,
  },
} as const;

// ============================================================================
// SCHEMAS
// ============================================================================

const devServerConfigSchema = z.object({
  command: z.string().min(1, { message: "devServer.command must not be empty" }),
  url: z.string().url({ message: "devServer.url must be a valid URL" }),
  timeoutMs: z
    .number()
    .int()
    .positive({ message: "devServer.timeoutMs must be a positive integer" })
    .max(120_000, { message: "devServer.timeoutMs must not exceed 120000ms" })
    .optional(),
  env: z.record(z.string()).optional(),
  reuseExisting: z.boolean().optional(),
});

const healthCheckSchema = z.object({
  name: z.string().min(1, { message: "health check name must not be empty" }),
  url: z.string().url({ message: "health check url must be a valid URL" }),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(60_000, { message: "health check timeoutMs must not exceed 60000ms" })
    .optional(),
});

const healthConfigSchema = z.object({
  checks: z.array(healthCheckSchema).min(1, {
    message: "health config must have at least one check",
  }),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(60_000, { message: "health.timeoutMs must not exceed 60000ms" })
    .optional(),
});

const smokeStepSchema = z.object({
  action: z.enum(["navigate", "waitFor", "assertText", "assertStatus"]),
  url: z.string().optional(),
  selector: z.string().optional(),
  text: z.string().optional(),
  expectedStatus: z.number().int().min(100).max(599).optional(),
});

const smokeConfigSchema = z.object({
  steps: z.array(smokeStepSchema).min(1, {
    message: "smoke config must have at least one step",
  }),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(120_000, { message: "smoke.timeoutMs must not exceed 120000ms" })
    .optional(),
});

const browserConfigSchema = z.object({
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(300_000, { message: "browser.timeoutMs must not exceed 300000ms" })
    .optional(),
  viewport: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  screenshotOnFailure: z.boolean().optional(),
});

const apiConfigSchema = z.object({
  baseUrl: z.string().url({ message: "api.baseUrl must be a valid URL" }),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(120_000, { message: "api.timeoutMs must not exceed 120000ms" })
    .optional(),
});

const screenshotConfigSchema = z.object({
  storage: z.enum(["base64", "disk"]).optional(),
  directory: z.string().min(1).optional(),
  onPass: z.enum(["always", "never"]).optional(),
  onFail: z.enum(["always", "never"]).optional(),
});

const reportConfigSchema = z.object({
  outputPath: z.string().min(1).optional(),
  includeScreenshots: z.boolean().optional(),
});

const selfTestConfigSchema = z.object({
  workspace: z.string().min(1, { message: "workspace must not be empty" }),
  devServer: devServerConfigSchema.optional(),
  health: healthConfigSchema.optional(),
  smoke: smokeConfigSchema.optional(),
  browser: browserConfigSchema.optional(),
  api: apiConfigSchema.optional(),
  screenshots: screenshotConfigSchema.optional(),
  report: reportConfigSchema.optional(),
  maxTotalDurationMs: z
    .number()
    .int()
    .positive({ message: "maxTotalDurationMs must be a positive integer" })
    .max(600_000, { message: "maxTotalDurationMs must not exceed 600000ms (10 min)" })
    .optional(),
});

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Validate a SelfTestConfig, returning the parsed result or throwing ZodError.
 */
export function validateSelfTestConfig(config: unknown): SelfTestConfig {
  return selfTestConfigSchema.parse(config) as SelfTestConfig;
}

/**
 * Resolve config by applying defaults to validated config.
 */
export function resolveSelfTestConfig(config: SelfTestConfig): ResolvedSelfTestConfig {
  return {
    workspace: config.workspace,
    ...(config.devServer
      ? {
          devServer: {
            command: config.devServer.command,
            url: config.devServer.url,
            timeoutMs: config.devServer.timeoutMs ?? CONFIG_DEFAULTS.devServer.timeoutMs,
            env: config.devServer.env ?? {},
            reuseExisting:
              config.devServer.reuseExisting ?? CONFIG_DEFAULTS.devServer.reuseExisting,
          },
        }
      : {}),
    ...(config.health ? { health: config.health } : {}),
    ...(config.smoke ? { smoke: config.smoke } : {}),
    browser: {
      timeoutMs: config.browser?.timeoutMs ?? CONFIG_DEFAULTS.browser.timeoutMs,
      viewport: config.browser?.viewport ?? CONFIG_DEFAULTS.browser.viewport,
      screenshotOnFailure:
        config.browser?.screenshotOnFailure ?? CONFIG_DEFAULTS.browser.screenshotOnFailure,
    },
    ...(config.api ? { api: config.api } : {}),
    screenshots: {
      storage: config.screenshots?.storage ?? CONFIG_DEFAULTS.screenshots.storage,
      directory: config.screenshots?.directory ?? CONFIG_DEFAULTS.screenshots.directory,
      onPass: config.screenshots?.onPass ?? CONFIG_DEFAULTS.screenshots.onPass,
      onFail: config.screenshots?.onFail ?? CONFIG_DEFAULTS.screenshots.onFail,
    },
    report: {
      outputPath: config.report?.outputPath ?? CONFIG_DEFAULTS.report.outputPath,
      includeScreenshots:
        config.report?.includeScreenshots ?? CONFIG_DEFAULTS.report.includeScreenshots,
    },
    maxTotalDurationMs: config.maxTotalDurationMs ?? CONFIG_DEFAULTS.maxTotalDurationMs,
  };
}
