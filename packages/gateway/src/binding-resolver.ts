import type { AgentBinding } from "./protocol/bindings.js";
import type { LaneMessage } from "./protocol/lanes.js";

// ---------------------------------------------------------------------------
// Compiled Matcher Types
// ---------------------------------------------------------------------------

/**
 * A pre-compiled field matcher for fast evaluation.
 * Compiled once on config load, evaluated per-message.
 */
export type FieldMatcher =
  | { readonly type: "exact"; readonly value: string }
  | { readonly type: "prefix"; readonly value: string }
  | { readonly type: "suffix"; readonly value: string }
  | { readonly type: "any" };

export interface CompiledBinding {
  readonly agentId: string;
  readonly matchers: {
    readonly channel?: FieldMatcher;
    readonly accountId?: FieldMatcher;
    readonly peerId?: FieldMatcher;
  };
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Compile a glob-like pattern into a FieldMatcher.
 *
 * Supported patterns:
 * - `"*"` → matches anything
 * - `"foo-*"` → prefix match (starts with "foo-")
 * - `"*-bar"` → suffix match (ends with "-bar")
 * - `"exact"` → exact match
 */
export function compilePattern(pattern: string): FieldMatcher {
  if (pattern === "*") {
    return { type: "any" };
  }
  if (pattern.startsWith("*") && !pattern.endsWith("*")) {
    return { type: "suffix", value: pattern.slice(1) };
  }
  if (pattern.endsWith("*") && !pattern.startsWith("*")) {
    return { type: "prefix", value: pattern.slice(0, -1) };
  }
  return { type: "exact", value: pattern };
}

/**
 * Test whether a field value matches a compiled matcher.
 */
export function matchField(matcher: FieldMatcher, value: string): boolean {
  switch (matcher.type) {
    case "any":
      return true;
    case "exact":
      return value === matcher.value;
    case "prefix":
      return value.startsWith(matcher.value);
    case "suffix":
      return value.endsWith(matcher.value);
  }
}

/**
 * Compile an array of AgentBinding definitions into CompiledBindings.
 * Called once on config load and on hot-reload.
 */
export function compileBindings(bindings: readonly AgentBinding[]): readonly CompiledBinding[] {
  return bindings.map((binding) => ({
    agentId: binding.agentId,
    matchers: {
      ...(binding.match.channel !== undefined
        ? { channel: compilePattern(binding.match.channel) }
        : {}),
      ...(binding.match.accountId !== undefined
        ? { accountId: compilePattern(binding.match.accountId) }
        : {}),
      ...(binding.match.peerId !== undefined
        ? { peerId: compilePattern(binding.match.peerId) }
        : {}),
    },
  }));
}

// ---------------------------------------------------------------------------
// BindingResolver
// ---------------------------------------------------------------------------

/**
 * Resolves inbound messages to a logical agentId using declarative binding rules.
 *
 * Bindings are evaluated in declaration order (first match wins).
 * A binding with no match criteria acts as a catch-all.
 *
 * Thread-safe: `updateBindings()` atomically swaps the compiled binding list
 * via immutable reference replacement.
 */
export class BindingResolver {
  private compiled: readonly CompiledBinding[] = [];

  /**
   * Recompile and atomically swap the binding list.
   * Called on initial config load and on hot-reload.
   */
  updateBindings(bindings: readonly AgentBinding[]): void {
    this.compiled = compileBindings(bindings);
  }

  /**
   * Resolve a message to an agentId using first-match-wins.
   * Returns `undefined` if no binding matches.
   */
  resolve(message: LaneMessage): string | undefined {
    for (const binding of this.compiled) {
      if (this.matches(binding, message)) {
        return binding.agentId;
      }
    }
    return undefined;
  }

  /**
   * Get the current compiled bindings (for testing/inspection).
   */
  getCompiled(): readonly CompiledBinding[] {
    return this.compiled;
  }

  private matches(binding: CompiledBinding, message: LaneMessage): boolean {
    const { channel, accountId, peerId } = binding.matchers;

    // Each defined matcher must match; undefined matchers match anything
    if (channel && !matchField(channel, message.channelId)) {
      return false;
    }
    if (accountId) {
      const value = message.routingContext?.accountId;
      if (!value || !matchField(accountId, value)) {
        return false;
      }
    }
    if (peerId) {
      const value = message.routingContext?.peerId;
      if (!value || !matchField(peerId, value)) {
        return false;
      }
    }

    return true;
  }
}
