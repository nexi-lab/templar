/**
 * Shared HTTP utility — fetch + timeout + error classification.
 */

import { SearchProviderError, SearchRateLimitedError } from "@templar/errors";
import { DEFAULT_TIMEOUT_MS } from "./types.js";

/**
 * Fetch JSON from a URL with timeout and error classification.
 *
 * @param providerId - Provider identifier for error context
 * @param url - URL to fetch
 * @param init - Fetch init options (method, headers, body)
 * @param timeoutMs - Request timeout in milliseconds (default 10_000)
 * @param signal - Optional external abort signal
 * @returns Parsed JSON response
 */
export async function fetchJson<T>(
  providerId: string,
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Link external signal to internal controller
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw new SearchRateLimitedError(providerId);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SearchProviderError(providerId, `HTTP ${response.status}: ${body}`);
    }

    const json = (await response.json()) as T;
    return json;
  } catch (error) {
    if (error instanceof SearchRateLimitedError || error instanceof SearchProviderError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) {
        throw error;
      }
      throw new SearchProviderError(providerId, `Request timed out after ${timeoutMs}ms`);
    }

    throw new SearchProviderError(
      providerId,
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error : undefined,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}
