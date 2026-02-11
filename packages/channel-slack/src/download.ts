import { Readable } from "node:stream";
import { ChannelSendError } from "@templar/errors";

export interface DownloadResult {
  readonly stream: Readable;
  readonly length: number;
}

/**
 * Download a file from a URL and return a Node.js Readable stream.
 * Uses streaming (no buffering). Returns a Node.js Readable because
 * Bolt's filesUploadV2 expects Node streams, not Web ReadableStreams.
 *
 * @throws {ChannelSendError} on network failure or non-ok response
 */
export async function downloadFile(url: string): Promise<DownloadResult> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new ChannelSendError(
      "slack",
      `Failed to download file: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  if (!response.ok) {
    throw new ChannelSendError(
      "slack",
      `Failed to download file: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const length = Number(response.headers.get("content-length") ?? 0);
  const webStream = response.body;

  if (!webStream) {
    throw new ChannelSendError("slack", "Failed to download file: empty response body");
  }

  // Convert Web ReadableStream → Node.js Readable for Bolt compatibility
  const stream = Readable.fromWeb(webStream);

  return { stream, length };
}
