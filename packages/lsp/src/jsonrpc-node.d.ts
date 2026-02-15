/**
 * vscode-jsonrpc/node subpath declarations.
 *
 * The vscode-jsonrpc package lacks an `exports` field, so TypeScript's
 * "NodeNext" module resolution can't resolve the `/node` entry point.
 * We declare the subset of types we actually use.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "vscode-jsonrpc/node" {
  import type { Readable, Writable } from "node:stream";

  export interface MessageReader {
    listen(callback: (data: any) => void): void;
    dispose(): void;
    onError: any;
    onClose: any;
    onPartialMessage: any;
  }

  export interface MessageWriter {
    write(msg: any): Promise<void>;
    dispose(): void;
    onError: any;
    onClose: any;
  }

  export class StreamMessageReader implements MessageReader {
    constructor(readable: Readable, encoding?: string);
    listen(callback: (data: any) => void): void;
    dispose(): void;
    onError: any;
    onClose: any;
    onPartialMessage: any;
  }

  export class StreamMessageWriter implements MessageWriter {
    constructor(writable: Writable, encoding?: string);
    write(msg: any): Promise<void>;
    dispose(): void;
    onError: any;
    onClose: any;
  }

  export interface MessageConnection {
    sendRequest(method: string, ...params: any[]): Promise<any>;
    sendNotification(method: string, ...params: any[]): Promise<void>;
    onRequest(method: string, handler: (...params: any[]) => any): void;
    onNotification(method: string, handler: (...params: any[]) => void): void;
    listen(): void;
    dispose(): void;
  }

  export function createMessageConnection(
    reader: MessageReader,
    writer: MessageWriter,
    logger?: any,
    options?: any,
  ): MessageConnection;
}
