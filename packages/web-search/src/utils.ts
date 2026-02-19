/**
 * Shared utilities for web search providers.
 */

/**
 * Truncate a snippet to a maximum length, appending "..." if truncated.
 */
export function truncateSnippet(snippet: string, maxLength: number): string {
  if (snippet.length <= maxLength) return snippet;
  return `${snippet.slice(0, maxLength - 3)}...`;
}
