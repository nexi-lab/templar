/**
 * Provider-aware error classification for multi-provider LLM routing.
 *
 * Maps raw provider errors and @templar/errors instances into a unified
 * {@link ClassificationResult} with category, optional retry-after delay,
 * and metadata.
 */

import {
  isExternalError,
  isPermissionError,
  isRateLimitError,
  isTemplarError,
  isTimeoutError,
  isValidationError,
} from "@templar/errors";
import type { ClassificationResult, ProviderErrorCategory } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify an error into a {@link ClassificationResult}.
 *
 * 1. If the error is a `TemplarError`, classification is based on its code.
 * 2. Otherwise, HTTP status and response body are extracted from the raw
 *    error and matched against provider-specific tables.
 */
export function classifyError(error: unknown, provider?: string): ClassificationResult {
  if (error === null || error === undefined || typeof error === "string") {
    return { category: "unknown" };
  }

  if (isTemplarError(error)) {
    return classifyByCode(error);
  }

  return classifyRawError(error, provider);
}

// ---------------------------------------------------------------------------
// TemplarError classification
// ---------------------------------------------------------------------------

function classifyByCode(error: { readonly code: string }): ClassificationResult {
  const code = error.code;

  if (code === "MODEL_PROVIDER_AUTH_FAILED") return { category: "auth" };
  if (code === "MODEL_PROVIDER_BILLING_FAILED") return { category: "billing" };
  if (code === "MODEL_PROVIDER_RATE_LIMITED") return { category: "rate_limit" };
  if (code === "MODEL_PROVIDER_TIMEOUT") return { category: "timeout" };
  if (code === "MODEL_CONTEXT_OVERFLOW") return { category: "context_overflow" };
  if (code === "MODEL_PROVIDER_ERROR") return { category: "model_error" };
  if (code === "MODEL_THINKING_FAILED") return { category: "thinking" };

  // Fall back to type guards for non-model errors
  if (isPermissionError(error)) return { category: "auth" };
  if (isRateLimitError(error)) return { category: "rate_limit" };
  if (isTimeoutError(error)) return { category: "timeout" };
  if (isValidationError(error)) return { category: "unknown" };
  if (isExternalError(error)) return { category: "unknown" };

  return { category: "unknown" };
}

// ---------------------------------------------------------------------------
// Raw error classification (non-TemplarError)
// ---------------------------------------------------------------------------

function classifyRawError(error: unknown, provider?: string): ClassificationResult {
  const status = extractHttpStatus(error);
  const body = extractErrorBody(error);
  const retryAfterMs = extractRetryAfter(error);

  // Try provider-specific matcher first
  if (provider && provider in PROVIDER_MATCHERS) {
    const matcher = PROVIDER_MATCHERS[provider];
    if (matcher) {
      const result = matcher(status, body);
      if (result !== "unknown") {
        return {
          category: result,
          ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
        };
      }
    }
  }

  // Fall back to generic HTTP status classification
  const category = classifyByHttpStatus(status);
  return {
    category,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

// ---------------------------------------------------------------------------
// HTTP status extraction
// ---------------------------------------------------------------------------

function extractHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const e = error as Record<string, unknown>;

  // Direct status field (most common)
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;

  // Nested in response object
  const response = e.response;
  if (typeof response === "object" && response !== null) {
    const r = response as Record<string, unknown>;
    if (typeof r.status === "number") return r.status;
    if (typeof r.statusCode === "number") return r.statusCode;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Error body extraction
// ---------------------------------------------------------------------------

function extractErrorBody(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";

  const e = error as Record<string, unknown>;

  // message field
  if (typeof e.message === "string") return e.message;

  // error.error.message (OpenAI / Anthropic patterns)
  const errorField = e.error;
  if (typeof errorField === "object" && errorField !== null) {
    const ef = errorField as Record<string, unknown>;
    if (typeof ef.message === "string") return ef.message;
    if (typeof ef.type === "string") return ef.type;
  }

  // error.body (some SDKs)
  if (typeof e.body === "string") return e.body;

  return "";
}

// ---------------------------------------------------------------------------
// Retry-After extraction
// ---------------------------------------------------------------------------

/** Maximum allowed retry-after in ms (5 minutes) */
const MAX_RETRY_AFTER_MS = 300_000;

function extractRetryAfter(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const e = error as Record<string, unknown>;

  // Try error.headers['retry-after']
  const retryAfter =
    getRetryAfterFromHeaders(e.headers) ??
    getRetryAfterFromHeaders((e.response as Record<string, unknown> | undefined)?.headers);

  if (retryAfter === undefined) return undefined;

  return parseRetryAfterValue(retryAfter);
}

function getRetryAfterFromHeaders(headers: unknown): string | undefined {
  if (typeof headers === "object" && headers !== null) {
    const h = headers as Record<string, unknown>;

    // Map/Headers .get()
    if (typeof h.get === "function") {
      const val = (h as { get(name: string): unknown }).get("retry-after");
      if (typeof val === "string") return val;
    }

    // Plain object
    const val = h["retry-after"] ?? h["Retry-After"];
    if (typeof val === "string") return val;
  }
  return undefined;
}

function parseRetryAfterValue(value: string): number | undefined {
  // Try as integer seconds
  const seconds = Number(value);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  // Try as HTTP-date
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    const delayMs = Math.max(0, date - Date.now());
    return Math.min(delayMs, MAX_RETRY_AFTER_MS);
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Provider-specific matchers
// ---------------------------------------------------------------------------

type ProviderMatcher = (status: number | undefined, body: string) => ProviderErrorCategory;

const PROVIDER_MATCHERS: Readonly<Record<string, ProviderMatcher>> = {
  anthropic: classifyAnthropic,
  openai: classifyOpenAI,
  google: classifyGoogle,
  ollama: classifyOllama,
};

function classifyAnthropic(status: number | undefined, body: string): ProviderErrorCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || status === 529) return "rate_limit";
  if (status === 500) return "model_error";

  if (status === 400) {
    const lower = body.toLowerCase();
    if (
      lower.includes("budget_tokens") ||
      lower.includes("thinking block") ||
      lower.includes("thinking blocks")
    ) {
      return "thinking";
    }
    if (lower.includes("context") || lower.includes("token")) {
      return "context_overflow";
    }
    return "unknown";
  }

  return "unknown";
}

function classifyOpenAI(status: number | undefined, body: string): ProviderErrorCategory {
  if (status === 401) return "auth";
  if (status === 403) return "auth";

  if (status === 429) {
    const lower = body.toLowerCase();
    if (lower.includes("insufficient_quota")) return "billing";
    return "rate_limit";
  }

  if (status === 400) {
    const lower = body.toLowerCase();
    if (lower.includes("context_length_exceeded")) return "context_overflow";
    if (lower.includes("model_not_found")) return "model_error";
    return "unknown";
  }

  if (status === 500 || status === 503) return "model_error";

  return "unknown";
}

function classifyGoogle(status: number | undefined, body: string): ProviderErrorCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 404 || status === 500 || status === 503) return "model_error";

  if (status === 400) {
    const lower = body.toLowerCase();
    if (lower.includes("token") || lower.includes("context")) {
      return "context_overflow";
    }
    return "unknown";
  }

  return "unknown";
}

function classifyOllama(status: number | undefined, _body: string): ProviderErrorCategory {
  if (status === 404) return "model_error";
  if (status === 429) return "rate_limit";
  if (status === 500 || status === 502) return "model_error";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Generic HTTP status fallback
// ---------------------------------------------------------------------------

function classifyByHttpStatus(status: number | undefined): ProviderErrorCategory {
  if (status === undefined) return "unknown";

  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status === 413) return "context_overflow";
  if (status >= 500) return "model_error";

  return "unknown";
}
