import { ChannelLoadError } from "@templar/errors";

/**
 * Create a lazy loader for an SDK module with explicit memoization.
 *
 * Returns a function that dynamically imports the module on first call,
 * caches the result, and returns the cached value on subsequent calls.
 * Throws ChannelLoadError if the import fails.
 *
 * @param channelName - Channel name for error messages
 * @param moduleName - The npm module to dynamically import
 * @param extract - Function to extract the desired value from the module
 */
export function lazyLoad<T>(
  channelName: string,
  moduleName: string,
  extract: (mod: unknown) => T,
): () => Promise<T> {
  let cached: T | undefined;
  return async () => {
    if (cached !== undefined) return cached;
    try {
      const mod: unknown = await import(moduleName);
      cached = extract(mod);
      return cached;
    } catch (error) {
      throw new ChannelLoadError(
        channelName,
        `Failed to load ${moduleName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
