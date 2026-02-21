/**
 * Minimal type declaration for picomatch v4.
 *
 * picomatch v4 does not ship built-in types.
 */
declare module "picomatch" {
  interface PicomatchOptions {
    /** Enable dotfile matching */
    dot?: boolean;
    /** Disable brace expansion */
    nobrace?: boolean;
    /** Case-insensitive matching */
    nocase?: boolean;
  }

  /**
   * Create a matcher function from a glob pattern.
   */
  function picomatch(
    pattern: string | readonly string[],
    options?: PicomatchOptions,
  ): (input: string) => boolean;

  export default picomatch;
}
