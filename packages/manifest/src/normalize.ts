/**
 * Sugar syntax normalizer for agent manifests.
 *
 * Transforms shorthand YAML fields (string model, string[] channels,
 * top-level prompt) into the full structured form expected by the Zod schema.
 * Always returns a new object — never mutates the input.
 */

/** Maps model-name prefixes to their provider */
const PROVIDER_PREFIX_MAP: ReadonlyArray<readonly [string, string]> = [
  ["claude-", "anthropic"],
  ["claude3", "anthropic"],
  ["gpt-", "openai"],
  ["o1-", "openai"],
  ["o3-", "openai"],
  ["o4-", "openai"],
  ["gemini-", "google"],
  ["gemini2", "google"],
  ["command-", "cohere"],
  ["mistral-", "mistral"],
  ["mixtral-", "mistral"],
  ["llama-", "meta"],
  ["llama3", "meta"],
];

function inferProvider(modelName: string): string {
  for (const [prefix, provider] of PROVIDER_PREFIX_MAP) {
    if (modelName.startsWith(prefix)) {
      return provider;
    }
  }
  throw new Error(
    `Cannot infer provider for model "${modelName}". Use "provider/model" format (e.g. "anthropic/${modelName}").`,
  );
}

interface ModelConfig {
  readonly provider: string;
  readonly name: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

function normalizeModel(model: unknown): ModelConfig | undefined {
  if (model === undefined || model === null) {
    return undefined;
  }
  if (typeof model === "string") {
    const slashIndex = model.indexOf("/");
    if (slashIndex > 0) {
      return {
        provider: model.slice(0, slashIndex),
        name: model.slice(slashIndex + 1),
      };
    }
    return {
      provider: inferProvider(model),
      name: model,
    };
  }
  // Object form — pass through as-is
  return model as ModelConfig;
}

interface ChannelConfig {
  readonly type: string;
  readonly config: Record<string, unknown>;
}

function normalizeChannels(channels: unknown): ChannelConfig[] | undefined {
  if (channels === undefined || channels === null) {
    return undefined;
  }
  if (!Array.isArray(channels)) {
    return channels as ChannelConfig[];
  }
  return channels.map((ch) => {
    if (typeof ch === "string") {
      return { type: ch, config: {} };
    }
    return ch as ChannelConfig;
  });
}

interface ChannelIdentityConfig {
  readonly name?: string;
  readonly avatar?: string;
  readonly bio?: string;
  readonly systemPromptPrefix?: string;
}

interface IdentityConfig {
  readonly default?: ChannelIdentityConfig;
  readonly channels?: Record<string, ChannelIdentityConfig>;
}

function normalizeIdentity(prompt: unknown, identity: unknown): IdentityConfig | undefined {
  if (prompt === undefined || prompt === null || typeof prompt !== "string") {
    return identity as IdentityConfig | undefined;
  }

  const existing = (identity as IdentityConfig | undefined) ?? {};
  const existingDefault = existing.default ?? {};

  // Top-level `prompt` sugar takes precedence over identity.default.systemPromptPrefix
  return {
    ...existing,
    default: {
      ...existingDefault,
      systemPromptPrefix: prompt,
    },
  };
}

/**
 * Normalizes sugar syntax in a raw manifest object into the full structured
 * form expected by the Zod schema.
 *
 * - `model: "provider/name"` → `model: { provider, name }`
 * - `model: "claude-sonnet-4-5"` → `model: { provider: "anthropic", name: "claude-sonnet-4-5" }`
 * - `channels: ["slack"]` → `channels: [{ type: "slack", config: {} }]`
 * - `prompt: "..."` → `identity.default.systemPromptPrefix: "..."`
 * - `schedule` passes through unchanged
 *
 * Always returns a **new object** — never mutates the input.
 */
export function normalizeManifest(raw: Record<string, unknown>): Record<string, unknown> {
  const { model, channels, prompt, ...rest } = raw;

  const normalized: Record<string, unknown> = { ...rest };

  const normalizedModel = normalizeModel(model);
  if (normalizedModel !== undefined) {
    normalized.model = normalizedModel;
  }

  const normalizedChannels = normalizeChannels(channels);
  if (normalizedChannels !== undefined) {
    normalized.channels = normalizedChannels;
  }

  const normalizedIdentity = normalizeIdentity(prompt, rest.identity);
  if (normalizedIdentity !== undefined) {
    normalized.identity = normalizedIdentity;
  }

  // prompt is consumed by normalizeIdentity — do not carry it forward

  return normalized;
}
