import { Readable } from "node:stream";
import { ChannelSendError } from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "../../download.js";

describe("downloadFile", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns a Node.js Readable stream and length on success", async () => {
    const mockWebStream = new ReadableStream();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-length": "2048" }),
      body: mockWebStream,
    });

    const result = await downloadFile("https://example.com/file.pdf");

    // Should be converted from Web ReadableStream to Node.js Readable
    expect(result.stream).toBeInstanceOf(Readable);
    expect(result.length).toBe(2048);
  });

  it("throws ChannelSendError on network failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    await expect(downloadFile("https://example.com/file.pdf")).rejects.toThrow(ChannelSendError);
    await expect(downloadFile("https://example.com/file.pdf")).rejects.toThrow(
      /Failed to download file/,
    );
  });

  it("throws ChannelSendError on non-ok response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
      body: null,
    });

    await expect(downloadFile("https://example.com/missing.pdf")).rejects.toThrow(ChannelSendError);
    await expect(downloadFile("https://example.com/missing.pdf")).rejects.toThrow(/HTTP 404/);
  });

  it("throws ChannelSendError when body is null", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: null,
    });

    await expect(downloadFile("https://example.com/empty")).rejects.toThrow(ChannelSendError);
    await expect(downloadFile("https://example.com/empty")).rejects.toThrow(/empty response body/);
  });

  it("defaults length to 0 when content-length header is missing", async () => {
    const mockWebStream = new ReadableStream();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: mockWebStream,
    });

    const result = await downloadFile("https://example.com/file.pdf");
    expect(result.length).toBe(0);
  });
});
