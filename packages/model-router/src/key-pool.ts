import type { KeyConfig, ProviderConfig } from "./types.js";

/**
 * Manages API keys per provider with round-robin selection and cooldown.
 *
 * Internal state: Map<provider, Map<key, cooldownExpiresAt>>
 * Lazy cleanup: expired cooldowns are pruned on access.
 */
export class KeyPool {
  /** provider → key configs (immutable reference) */
  private readonly keys: ReadonlyMap<string, readonly KeyConfig[]>;
  /** provider → (key → cooldown expiry timestamp) */
  private readonly cooldowns: Map<string, Map<string, number>>;
  /** provider → next round-robin index */
  private readonly indices: Map<string, number>;
  /** provider → cooldown duration in ms */
  private readonly cooldownDurations: ReadonlyMap<string, number>;

  private static readonly DEFAULT_COOLDOWN_MS = 300_000; // 5 minutes

  constructor(providers: Readonly<Record<string, ProviderConfig>>) {
    const keys = new Map<string, readonly KeyConfig[]>();
    const cooldowns = new Map<string, Map<string, number>>();
    const indices = new Map<string, number>();
    const cooldownDurations = new Map<string, number>();

    for (const [providerId, config] of Object.entries(providers)) {
      const sorted = [...config.keys].sort(
        (a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER),
      );
      keys.set(providerId, sorted);
      cooldowns.set(providerId, new Map());
      indices.set(providerId, 0);
      cooldownDurations.set(providerId, config.cooldownMs ?? KeyPool.DEFAULT_COOLDOWN_MS);
    }

    this.keys = keys;
    this.cooldowns = cooldowns;
    this.indices = indices;
    this.cooldownDurations = cooldownDurations;
  }

  /**
   * Select the next available key for a provider (round-robin among non-cooldown keys).
   * Returns undefined if all keys are in cooldown.
   */
  selectKey(provider: string): KeyConfig | undefined {
    const providerKeys = this.keys.get(provider);
    if (!providerKeys || providerKeys.length === 0) return undefined;

    const now = Date.now();
    this.pruneExpired(provider, now);

    const providerCooldowns = this.cooldowns.get(provider);
    const startIndex = this.indices.get(provider) ?? 0;
    const count = providerKeys.length;

    for (let i = 0; i < count; i++) {
      const idx = (startIndex + i) % count;
      const keyConfig = providerKeys[idx];
      if (keyConfig && !providerCooldowns?.has(keyConfig.key)) {
        this.indices.set(provider, (idx + 1) % count);
        return keyConfig;
      }
    }

    return undefined;
  }

  /**
   * Mark a key as in cooldown for the provider's configured duration.
   */
  markCooldown(provider: string, key: string): void {
    const providerCooldowns = this.cooldowns.get(provider);
    if (!providerCooldowns) return;

    const duration = this.cooldownDurations.get(provider) ?? KeyPool.DEFAULT_COOLDOWN_MS;
    providerCooldowns.set(key, Date.now() + duration);
  }

  /**
   * Check if a specific key is available (not in cooldown).
   */
  isKeyAvailable(provider: string, key: string): boolean {
    const providerCooldowns = this.cooldowns.get(provider);
    if (!providerCooldowns) return false;

    const expiresAt = providerCooldowns.get(key);
    if (expiresAt === undefined) return true;

    if (Date.now() >= expiresAt) {
      providerCooldowns.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Check if any keys are available for a provider.
   */
  hasAvailableKeys(provider: string): boolean {
    const providerKeys = this.keys.get(provider);
    if (!providerKeys || providerKeys.length === 0) return false;

    const now = Date.now();
    this.pruneExpired(provider, now);

    const providerCooldowns = this.cooldowns.get(provider);
    if (!providerCooldowns || providerCooldowns.size === 0) return true;

    return providerCooldowns.size < providerKeys.length;
  }

  /**
   * Get the total number of keys for a provider.
   */
  totalKeys(provider: string): number {
    return this.keys.get(provider)?.length ?? 0;
  }

  /**
   * Get the number of available (non-cooldown) keys for a provider.
   */
  availableKeys(provider: string): number {
    const providerKeys = this.keys.get(provider);
    if (!providerKeys) return 0;

    const now = Date.now();
    this.pruneExpired(provider, now);

    const providerCooldowns = this.cooldowns.get(provider);
    return providerKeys.length - (providerCooldowns?.size ?? 0);
  }

  /** Lazy cleanup: prune expired cooldowns on access */
  private pruneExpired(provider: string, now: number): void {
    const providerCooldowns = this.cooldowns.get(provider);
    if (!providerCooldowns) return;

    for (const [key, expiresAt] of providerCooldowns) {
      if (now >= expiresAt) {
        providerCooldowns.delete(key);
      }
    }
  }
}
