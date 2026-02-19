/**
 * Generic resolver interface for progressive disclosure.
 *
 * Used by artifact discovery, skill resolution, and any system
 * that needs lightweight metadata at startup and full content on demand.
 *
 * @typeParam Meta - Lightweight metadata returned by discover()
 * @typeParam Full - Complete entity returned by load()
 */
export interface Resolver<Meta, Full> {
  /** Resolver name (for logging and debugging) */
  readonly name: string;
  /** Discover all available entities, returning metadata only */
  discover(): Promise<readonly Meta[]>;
  /** Load a specific entity's full content by identifier */
  load(id: string): Promise<Full | undefined>;
}
