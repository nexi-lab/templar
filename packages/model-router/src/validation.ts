import { z } from "zod";
import type { ModelRouterConfig } from "./types.js";

const KeyConfigSchema = z.object({
  key: z.string().min(1),
  priority: z.number().int().optional(),
});

const ProviderConfigSchema = z.object({
  keys: z.array(KeyConfigSchema).min(1, "Each provider must have at least 1 key"),
  cooldownMs: z.number().positive().optional(),
  models: z.array(z.string()).optional(),
});

const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().positive().optional(),
  failureWindowMs: z.number().positive().optional(),
  resetTimeoutMs: z.number().positive().optional(),
  halfOpenMaxAttempts: z.number().int().positive().optional(),
});

const ModelSelectionSchema = z.union([
  z.string().refine((s) => s.indexOf(":") > 0 && s.indexOf(":") < s.length - 1, {
    message: "ModelId must be in 'provider:model' format",
  }),
  z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    thinking: z.enum(["adaptive", "extended", "standard", "none"]).optional(),
  }),
]);

const FailoverActionSchema = z.enum([
  "rotate_key",
  "backoff",
  "retry",
  "compact",
  "fallback",
  "thinking_downgrade",
]);

const ProviderErrorCategorySchema = z.enum([
  "auth",
  "billing",
  "rate_limit",
  "timeout",
  "context_overflow",
  "model_error",
  "thinking",
  "unknown",
]);

const ModelRouterConfigSchema = z.object({
  providers: z
    .record(ProviderConfigSchema)
    .refine((p) => Object.keys(p).length > 0, { message: "At least one provider is required" }),
  defaultModel: ModelSelectionSchema,
  fallbackChain: z.array(ModelSelectionSchema).optional(),
  failoverStrategy: z.record(ProviderErrorCategorySchema, FailoverActionSchema).optional(),
  routingStrategy: z
    .object({
      name: z.string(),
      selectModel: z.function(),
    })
    .optional(),
  circuitBreaker: CircuitBreakerConfigSchema.optional(),
  thinkingDowngrade: z.boolean().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  retryBaseDelayMs: z.number().positive().optional(),
  retryMaxDelayMs: z.number().positive().optional(),
  onPreModelSelect: z.function().optional(),
});

/**
 * Validate and parse a ModelRouterConfig, throwing on invalid input.
 */
export function validateRouterConfig(config: unknown): ModelRouterConfig {
  const parsed = ModelRouterConfigSchema.parse(config);

  // Validate that defaultModel references a configured provider
  const defaultProvider =
    typeof parsed.defaultModel === "string"
      ? parsed.defaultModel.slice(0, parsed.defaultModel.indexOf(":"))
      : parsed.defaultModel.provider;

  if (!parsed.providers[defaultProvider]) {
    throw new Error(
      `Default model references provider "${defaultProvider}" which is not configured`,
    );
  }

  return parsed as unknown as ModelRouterConfig;
}
