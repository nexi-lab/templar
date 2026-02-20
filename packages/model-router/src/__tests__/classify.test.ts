import {
  ExternalError,
  PermissionError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "@templar/errors";
import { describe, expect, it } from "vitest";
import { classifyError } from "../classify.js";

// ---------------------------------------------------------------------------
// TemplarError instances
// ---------------------------------------------------------------------------

describe("classifyError", () => {
  describe("TemplarError instances", () => {
    it("classifies MODEL_PROVIDER_AUTH_FAILED as auth", () => {
      const error = new PermissionError<"MODEL_PROVIDER_AUTH_FAILED">({
        code: "MODEL_PROVIDER_AUTH_FAILED",
        message: "Invalid API key",
      });
      expect(classifyError(error)).toEqual({ category: "auth" });
    });

    it("classifies MODEL_PROVIDER_BILLING_FAILED as billing", () => {
      const error = new ExternalError<"MODEL_PROVIDER_BILLING_FAILED">({
        code: "MODEL_PROVIDER_BILLING_FAILED",
        message: "Payment required",
      });
      expect(classifyError(error)).toEqual({ category: "billing" });
    });

    it("classifies MODEL_PROVIDER_RATE_LIMITED as rate_limit", () => {
      const error = new RateLimitError<"MODEL_PROVIDER_RATE_LIMITED">({
        code: "MODEL_PROVIDER_RATE_LIMITED",
        message: "Rate limited",
      });
      expect(classifyError(error)).toEqual({ category: "rate_limit" });
    });

    it("classifies MODEL_PROVIDER_TIMEOUT as timeout", () => {
      const error = new TimeoutError<"MODEL_PROVIDER_TIMEOUT">({
        code: "MODEL_PROVIDER_TIMEOUT",
        message: "Timeout",
      });
      expect(classifyError(error)).toEqual({ category: "timeout" });
    });

    it("classifies MODEL_CONTEXT_OVERFLOW as context_overflow", () => {
      const error = new ValidationError<"MODEL_CONTEXT_OVERFLOW">({
        code: "MODEL_CONTEXT_OVERFLOW",
        message: "Context overflow",
      });
      expect(classifyError(error)).toEqual({ category: "context_overflow" });
    });

    it("classifies MODEL_PROVIDER_ERROR as model_error", () => {
      const error = new ExternalError<"MODEL_PROVIDER_ERROR">({
        code: "MODEL_PROVIDER_ERROR",
        message: "Provider error",
      });
      expect(classifyError(error)).toEqual({ category: "model_error" });
    });

    it("classifies MODEL_THINKING_FAILED as thinking", () => {
      const error = new ExternalError<"MODEL_THINKING_FAILED">({
        code: "MODEL_THINKING_FAILED",
        message: "Thinking failed",
      });
      expect(classifyError(error)).toEqual({ category: "thinking" });
    });

    it("classifies non-model PermissionError as auth", () => {
      const error = new PermissionError<"AUTH_FORBIDDEN">({
        code: "AUTH_FORBIDDEN",
        message: "Forbidden",
      });
      expect(classifyError(error)).toEqual({ category: "auth" });
    });

    it("classifies non-model RateLimitError as rate_limit", () => {
      const error = new RateLimitError<"RATE_LIMIT_EXCEEDED">({
        code: "RATE_LIMIT_EXCEEDED",
        message: "Rate limited",
      });
      expect(classifyError(error)).toEqual({ category: "rate_limit" });
    });

    it("classifies non-model ValidationError as unknown", () => {
      const error = new ValidationError<"VALIDATION_FAILED">({
        code: "VALIDATION_FAILED",
        message: "Validation failed",
      });
      expect(classifyError(error)).toEqual({ category: "unknown" });
    });

    it("classifies non-model ExternalError as unknown", () => {
      const error = new ExternalError<"INTERNAL_UNAVAILABLE">({
        code: "INTERNAL_UNAVAILABLE",
        message: "Unavailable",
      });
      expect(classifyError(error)).toEqual({ category: "unknown" });
    });
  });

  // ---------------------------------------------------------------------------
  // Raw errors — Anthropic
  // ---------------------------------------------------------------------------

  describe("raw errors — Anthropic", () => {
    it("classifies 401 as auth", () => {
      const error = { status: 401, message: "authentication_error" };
      expect(classifyError(error, "anthropic").category).toBe("auth");
    });

    it("classifies 403 as auth", () => {
      const error = { status: 403, message: "permission_error" };
      expect(classifyError(error, "anthropic").category).toBe("auth");
    });

    it("classifies 429 as rate_limit", () => {
      const error = { status: 429, message: "rate_limit_error" };
      expect(classifyError(error, "anthropic").category).toBe("rate_limit");
    });

    it("classifies 529 as rate_limit", () => {
      const error = { status: 529, message: "overloaded_error" };
      expect(classifyError(error, "anthropic").category).toBe("rate_limit");
    });

    it("classifies 400 with budget_tokens message as thinking", () => {
      const error = {
        status: 400,
        message: "budget_tokens must be >= 1024",
      };
      expect(classifyError(error, "anthropic").category).toBe("thinking");
    });

    it("classifies 400 with thinking blocks message as thinking", () => {
      const error = {
        status: 400,
        message: "Cannot modify thinking blocks in assistant messages",
      };
      expect(classifyError(error, "anthropic").category).toBe("thinking");
    });

    it("classifies 400 with context message as context_overflow", () => {
      const error = {
        status: 400,
        message: "context window exceeded",
      };
      expect(classifyError(error, "anthropic").category).toBe("context_overflow");
    });

    it("classifies 400 with token message as context_overflow", () => {
      const error = {
        status: 400,
        message: "maximum token limit exceeded",
      };
      expect(classifyError(error, "anthropic").category).toBe("context_overflow");
    });

    it("classifies 500 as model_error", () => {
      const error = { status: 500, message: "api_error" };
      expect(classifyError(error, "anthropic").category).toBe("model_error");
    });
  });

  // ---------------------------------------------------------------------------
  // Raw errors — OpenAI
  // ---------------------------------------------------------------------------

  describe("raw errors — OpenAI", () => {
    it("classifies 401 as auth", () => {
      const error = { status: 401, message: "invalid_api_key" };
      expect(classifyError(error, "openai").category).toBe("auth");
    });

    it("classifies 403 as auth", () => {
      const error = { status: 403, message: "permission denied" };
      expect(classifyError(error, "openai").category).toBe("auth");
    });

    it("classifies 429 with insufficient_quota as billing", () => {
      const error = { status: 429, message: "insufficient_quota" };
      expect(classifyError(error, "openai").category).toBe("billing");
    });

    it("classifies 429 without quota message as rate_limit", () => {
      const error = { status: 429, message: "rate limit exceeded" };
      expect(classifyError(error, "openai").category).toBe("rate_limit");
    });

    it("classifies 400 with context_length_exceeded as context_overflow", () => {
      const error = {
        status: 400,
        message: "context_length_exceeded: maximum context length is 128000",
      };
      expect(classifyError(error, "openai").category).toBe("context_overflow");
    });

    it("classifies 400 with model_not_found as model_error", () => {
      const error = { status: 400, message: "model_not_found" };
      expect(classifyError(error, "openai").category).toBe("model_error");
    });

    it("classifies 500 as model_error", () => {
      const error = { status: 500, message: "server_error" };
      expect(classifyError(error, "openai").category).toBe("model_error");
    });

    it("classifies 503 as model_error", () => {
      const error = { status: 503, message: "service unavailable" };
      expect(classifyError(error, "openai").category).toBe("model_error");
    });
  });

  // ---------------------------------------------------------------------------
  // Raw errors — Google
  // ---------------------------------------------------------------------------

  describe("raw errors — Google", () => {
    it("classifies 401 as auth", () => {
      const error = { status: 401, message: "UNAUTHENTICATED" };
      expect(classifyError(error, "google").category).toBe("auth");
    });

    it("classifies 403 as auth", () => {
      const error = { status: 403, message: "PERMISSION_DENIED" };
      expect(classifyError(error, "google").category).toBe("auth");
    });

    it("classifies 429 as rate_limit", () => {
      const error = { status: 429, message: "RESOURCE_EXHAUSTED" };
      expect(classifyError(error, "google").category).toBe("rate_limit");
    });

    it("classifies 404 as model_error", () => {
      const error = { status: 404, message: "NOT_FOUND" };
      expect(classifyError(error, "google").category).toBe("model_error");
    });

    it("classifies 500 as model_error", () => {
      const error = { status: 500, message: "INTERNAL" };
      expect(classifyError(error, "google").category).toBe("model_error");
    });

    it("classifies 503 as model_error", () => {
      const error = { status: 503, message: "UNAVAILABLE" };
      expect(classifyError(error, "google").category).toBe("model_error");
    });

    it("classifies 400 with token message as context_overflow", () => {
      const error = { status: 400, message: "token limit exceeded" };
      expect(classifyError(error, "google").category).toBe("context_overflow");
    });
  });

  // ---------------------------------------------------------------------------
  // Raw errors — Ollama
  // ---------------------------------------------------------------------------

  describe("raw errors — Ollama", () => {
    it("classifies 404 as model_error", () => {
      const error = { status: 404, message: "model not found" };
      expect(classifyError(error, "ollama").category).toBe("model_error");
    });

    it("classifies 429 as rate_limit", () => {
      const error = { status: 429, message: "too many requests" };
      expect(classifyError(error, "ollama").category).toBe("rate_limit");
    });

    it("classifies 500 as model_error", () => {
      const error = { status: 500, message: "internal server error" };
      expect(classifyError(error, "ollama").category).toBe("model_error");
    });

    it("classifies 502 as model_error", () => {
      const error = { status: 502, message: "bad gateway" };
      expect(classifyError(error, "ollama").category).toBe("model_error");
    });
  });

  // ---------------------------------------------------------------------------
  // Retry-After parsing
  // ---------------------------------------------------------------------------

  describe("Retry-After parsing", () => {
    it("parses seconds string into retryAfterMs", () => {
      const error = {
        status: 429,
        message: "rate limited",
        headers: { "retry-after": "5" },
      };
      const result = classifyError(error, "openai");
      expect(result.retryAfterMs).toBe(5000);
    });

    it("parses Retry-After header (capitalized)", () => {
      const error = {
        status: 429,
        message: "rate limited",
        headers: { "Retry-After": "10" },
      };
      const result = classifyError(error, "openai");
      expect(result.retryAfterMs).toBe(10_000);
    });

    it("returns undefined retryAfterMs when header is absent", () => {
      const error = { status: 429, message: "rate limited" };
      const result = classifyError(error, "openai");
      expect(result.retryAfterMs).toBeUndefined();
    });

    it("caps absurdly large retry-after to 5 minutes", () => {
      const error = {
        status: 429,
        message: "rate limited",
        headers: { "retry-after": "9999" },
      };
      const result = classifyError(error, "openai");
      expect(result.retryAfterMs).toBe(300_000);
    });

    it("extracts retry-after from response.headers", () => {
      const error = {
        status: 429,
        message: "rate limited",
        response: {
          headers: { "retry-after": "3" },
        },
      };
      const result = classifyError(error, "openai");
      expect(result.retryAfterMs).toBe(3000);
    });

    it("extracts retry-after from Headers-like .get() method", () => {
      const headers = new Map([["retry-after", "7"]]);
      const error = {
        status: 429,
        message: "rate limited",
        headers,
      };
      const result = classifyError(error, "openai");
      expect(result.retryAfterMs).toBe(7000);
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown provider / no provider
  // ---------------------------------------------------------------------------

  describe("unknown provider / no provider", () => {
    it("falls back to HTTP status classification without provider", () => {
      const error = { status: 429, message: "rate limited" };
      expect(classifyError(error).category).toBe("rate_limit");
    });

    it("falls back to HTTP status for unknown provider", () => {
      const error = { status: 401, message: "unauthorized" };
      expect(classifyError(error, "custom-provider").category).toBe("auth");
    });

    it("classifies 408 as timeout via HTTP status", () => {
      const error = { status: 408, message: "request timeout" };
      expect(classifyError(error).category).toBe("timeout");
    });

    it("classifies 504 as timeout via HTTP status", () => {
      const error = { status: 504, message: "gateway timeout" };
      expect(classifyError(error).category).toBe("timeout");
    });

    it("classifies 500+ as model_error via HTTP status", () => {
      const error = { status: 502, message: "bad gateway" };
      expect(classifyError(error).category).toBe("model_error");
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    it("returns unknown for null", () => {
      expect(classifyError(null).category).toBe("unknown");
    });

    it("returns unknown for undefined", () => {
      expect(classifyError(undefined).category).toBe("unknown");
    });

    it("returns unknown for string thrown", () => {
      expect(classifyError("some error").category).toBe("unknown");
    });

    it("returns unknown for error with no status", () => {
      const error = new Error("generic error");
      expect(classifyError(error).category).toBe("unknown");
    });

    it("returns unknown for number thrown", () => {
      expect(classifyError(42).category).toBe("unknown");
    });

    it("handles error with nested error.message", () => {
      const error = {
        status: 400,
        error: { message: "context_length_exceeded" },
      };
      // Without provider, generic HTTP 400 → unknown (only provider-specific matchers inspect body)
      expect(classifyError(error).category).toBe("unknown");
    });
  });
});
