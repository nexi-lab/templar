import type { ChannelCapabilities, InboundMessage } from "@templar/core";
import { BaseChannelAdapter, type BaseChannelAdapterOptions } from "../../base-adapter.js";

/**
 * A captured call to one of the mock adapter's methods.
 */
export interface CapturedCall {
  readonly method: "doConnect" | "doDisconnect" | "registerListener" | "getClient" | "doSend";
  readonly args: readonly unknown[];
}

/**
 * Options for creating a MockChannelAdapter.
 */
export interface MockChannelAdapterOptions {
  readonly name?: string;
  readonly capabilities?: ChannelCapabilities;
  readonly normalizer?: BaseChannelAdapterOptions<unknown, unknown>["normalizer"];
  readonly renderer?: BaseChannelAdapterOptions<unknown, unknown>["renderer"];
  readonly doConnectImpl?: () => Promise<void>;
  readonly doDisconnectImpl?: () => Promise<void>;
  readonly client?: unknown;
}

const DEFAULT_CAPABILITIES: ChannelCapabilities = {
  text: { supported: true, maxLength: 4096 },
} as const;

/**
 * Mock channel adapter for testing BaseChannelAdapter behavior.
 * Captures all abstract method calls for assertions.
 */
export class MockChannelAdapter extends BaseChannelAdapter<unknown, unknown> {
  readonly calls: CapturedCall[] = [];
  private listener: ((raw: unknown) => void) | undefined;
  private readonly mockClient: unknown;
  private readonly doConnectImpl: () => Promise<void>;
  private readonly doDisconnectImpl: () => Promise<void>;

  constructor(opts: MockChannelAdapterOptions = {}) {
    super({
      name: opts.name ?? "mock",
      capabilities: opts.capabilities ?? DEFAULT_CAPABILITIES,
      normalizer: opts.normalizer ?? ((raw: unknown) => raw as InboundMessage | undefined),
      renderer: opts.renderer ?? (async () => {}),
    });
    this.mockClient = opts.client ?? { send: async () => {} };
    this.doConnectImpl = opts.doConnectImpl ?? (async () => {});
    this.doDisconnectImpl = opts.doDisconnectImpl ?? (async () => {});
  }

  protected async doConnect(): Promise<void> {
    this.calls.push({ method: "doConnect", args: [] });
    await this.doConnectImpl();
  }

  protected async doDisconnect(): Promise<void> {
    this.calls.push({ method: "doDisconnect", args: [] });
    await this.doDisconnectImpl();
  }

  protected registerListener(callback: (raw: unknown) => void): void {
    this.calls.push({ method: "registerListener", args: [callback] });
    this.listener = callback;
  }

  protected getClient(): unknown {
    this.calls.push({ method: "getClient", args: [] });
    return this.mockClient;
  }

  /**
   * Simulate an inbound raw event (triggers the registered listener).
   */
  simulateInbound(raw: unknown): void {
    if (this.listener) {
      this.listener(raw);
    }
  }
}
