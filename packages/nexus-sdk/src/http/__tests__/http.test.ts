import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexusAPIError, NexusNetworkError, NexusTimeoutError } from "../../errors.js";
import { HttpClient } from "../index.js";

describe("HttpClient", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("basic requests", () => {
    it("should make successful GET request", async () => {
      const mockResponse = { id: "123", name: "test" };
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        apiKey: "test-key",
      });

      const result = await http.request("/test", { method: "GET" });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/test",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        }),
      );
    });

    it("should make successful POST request with body", async () => {
      const mockResponse = { id: "123" };
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
        }),
      );

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
      });

      const body = { name: "test" };
      const result = await http.request("/test", {
        method: "POST",
        body,
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/test",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    });

    it("should handle 204 No Content", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
        }),
      );

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
      });

      const result = await http.request("/test", { method: "DELETE" });

      expect(result).toBeUndefined();
    });

    it("should include query parameters", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
        }),
      );

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
      });

      await http.request("/test", {
        method: "GET",
        query: {
          limit: 10,
          status: "active",
          include: true,
          undefined: undefined,
        },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/test?limit=10&status=active&include=true",
        expect.any(Object),
      );
    });
  });

  describe("error handling", () => {
    it("should throw NexusAPIError on 4xx response", async () => {
      const errorResponse = {
        code: "INVALID_REQUEST",
        message: "Invalid request",
      };

      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorResponse), {
          status: 400,
        }),
      );

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
      });

      try {
        await http.request("/test", { method: "GET" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NexusAPIError);
        if (error instanceof NexusAPIError) {
          expect(error.statusCode).toBe(400);
          expect(error.response).toEqual(errorResponse);
          expect(error.message).toBe("Invalid request");
        }
      }
    });

    it("should throw NexusAPIError on 5xx response", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
      );

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
      });

      await expect(http.request("/test", { method: "GET" })).rejects.toThrow(NexusAPIError);

      try {
        await http.request("/test", { method: "GET" });
      } catch (error) {
        expect(error).toBeInstanceOf(NexusAPIError);
        if (error instanceof NexusAPIError) {
          expect(error.statusCode).toBe(500);
          expect(error.message).toContain("500");
        }
      }
    });

    it("should handle invalid JSON in error response", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response("not json", {
          status: 500,
        }),
      );

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
      });

      await expect(http.request("/test", { method: "GET" })).rejects.toThrow(NexusAPIError);
    });

    it("should handle invalid JSON in success response", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response("not json", {
          status: 200,
        }),
      );

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
      });

      await expect(http.request("/test", { method: "GET" })).rejects.toThrow(NexusAPIError);
    });
  });

  describe("retry logic", () => {
    it("should retry on 5xx errors", async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve(
            new Response(null, {
              status: 503,
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
          }),
        );
      });

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 3, initialDelay: 10 },
      });

      const result = await http.request("/test", { method: "GET" });

      expect(result).toEqual({ ok: true });
      expect(attempts).toBe(3);
    });

    it("should not retry on 4xx errors", async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Bad request" }), {
            status: 400,
          }),
        );
      });

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 3 },
      });

      await expect(http.request("/test", { method: "GET" })).rejects.toThrow(NexusAPIError);

      expect(attempts).toBe(1);
    });

    it("should retry on network errors", async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
          }),
        );
      });

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 3, initialDelay: 10 },
      });

      const result = await http.request("/test", { method: "GET" });

      expect(result).toEqual({ ok: true });
      expect(attempts).toBe(3);
    });

    it("should throw after max retry attempts", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 503,
        }),
      );

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 2, initialDelay: 10 },
      });

      await expect(http.request("/test", { method: "GET" })).rejects.toThrow(NexusAPIError);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should retry on timeout errors", async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation((_url, init) => {
        attempts++;
        if (attempts < 3) {
          // Simulate timeout by aborting
          const controller = new AbortController();
          controller.abort();
          if (init?.signal) {
            // Trigger the abort event
            return Promise.reject(new DOMException("Aborted", "AbortError"));
          }
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
          }),
        );
      });

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 3, initialDelay: 10 },
        timeout: 50,
      });

      const result = await http.request("/test", { method: "GET" });

      expect(result).toEqual({ ok: true });
      expect(attempts).toBe(3);
    });
  });

  describe("timeout handling", () => {
    it("should timeout long requests", async () => {
      global.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((resolve) => {
          // Check if signal is aborted
          if (init?.signal) {
            const controller = init.signal as AbortSignal;
            controller.addEventListener("abort", () => {
              const error = new DOMException("Aborted", "AbortError");
              resolve(Promise.reject(error));
            });
          }
          // Never resolve to simulate long request
          setTimeout(() => resolve(new Response()), 10000);
        });
      });

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        timeout: 50,
        retry: { maxAttempts: 1 },
      });

      await expect(http.request("/test", { method: "GET" })).rejects.toThrow(NexusTimeoutError);

      try {
        await http.request("/test", { method: "GET" });
      } catch (error) {
        expect(error).toBeInstanceOf(NexusTimeoutError);
        if (error instanceof NexusTimeoutError) {
          expect(error.timeout).toBe(50);
          expect(error.message).toContain("50ms");
        }
      }
    });
  });

  describe("builder methods", () => {
    it("should update retry options with withRetry", async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 5) {
          return Promise.resolve(new Response(null, { status: 503 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      });

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 2 },
      });

      const httpWithRetry = http.withRetry({
        maxAttempts: 5,
        initialDelay: 10,
      });

      const result = await httpWithRetry.request("/test", { method: "GET" });

      expect(result).toEqual({ ok: true });
      expect(attempts).toBe(5);
    });

    it("should update timeout with withTimeout", async () => {
      global.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((resolve) => {
          if (init?.signal) {
            const controller = init.signal as AbortSignal;
            controller.addEventListener("abort", () => {
              const error = new DOMException("Aborted", "AbortError");
              resolve(Promise.reject(error));
            });
          }
          setTimeout(() => resolve(new Response()), 10000);
        });
      });

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        timeout: 5000,
      });

      const httpWithTimeout = http.withTimeout(50);

      await expect(httpWithTimeout.request("/test", { method: "GET" })).rejects.toThrow(
        NexusTimeoutError,
      );
    });

    it("should return new instance from builder methods", () => {
      const http = new HttpClient({
        baseUrl: "https://api.test.com",
      });

      const http2 = http.withRetry({ maxAttempts: 5 });
      const http3 = http.withTimeout(5000);

      expect(http2).not.toBe(http);
      expect(http3).not.toBe(http);
      expect(http2).not.toBe(http3);
    });
  });

  describe("network errors", () => {
    it("should throw NexusNetworkError on fetch failure", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

      const http = new HttpClient({
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(http.request("/test", { method: "GET" })).rejects.toThrow(NexusNetworkError);

      try {
        await http.request("/test", { method: "GET" });
      } catch (error) {
        expect(error).toBeInstanceOf(NexusNetworkError);
        if (error instanceof NexusNetworkError) {
          expect(error.message).toContain("Network error");
        }
      }
    });
  });
});
