import type {
  Agent,
  AgentSideConnection,
  AuthenticateRequest,
  AuthenticateResponse,
  CancelNotification,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  RequestPermissionRequest,
  SessionUpdate,
  SetSessionModeRequest,
  SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import { PROTOCOL_VERSION, RequestError } from "@agentclientprotocol/sdk";
import type { ACPConfig } from "./config.js";
import { parseACPConfig } from "./config.js";
import type { ACPClientCapabilities, ACPContext, ACPRunHandler, ACPStopReason } from "./handler.js";
import { mapACPContentToBlocks } from "./mappers/from-acp.js";
import { SessionManager } from "./session.js";
import type { ACPTransport } from "./transport.js";
import { StdioTransport } from "./transport.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ACPServerOptions {
  /** Handler that processes prompt turns. */
  readonly handler: ACPRunHandler;
  /** Partial config — missing fields use defaults. */
  readonly config?: Partial<ACPConfig>;
  /** Optional transport override (default: StdioTransport). */
  readonly transport?: ACPTransport;
}

// ---------------------------------------------------------------------------
// ACPServer
// ---------------------------------------------------------------------------

/**
 * ACP-compliant agent server.
 *
 * Wraps the `@agentclientprotocol/sdk` AgentSideConnection and delegates
 * prompt processing to the provided ACPRunHandler. The server manages
 * session lifecycle and maps between ACP protocol types and Templar types.
 *
 * Usage:
 * ```ts
 * const server = new ACPServer({ handler: myHandler });
 * await server.connect();
 * // Server now listens on stdio for ACP JSON-RPC messages
 * await server.closed; // Wait for connection to close
 * ```
 */
export class ACPServer {
  private readonly config: ACPConfig;
  private readonly handler: ACPRunHandler;
  private readonly sessions: SessionManager;
  private readonly transportInstance: ACPTransport;
  private connection: AgentSideConnection | undefined;
  private connected = false;
  private clientCapabilities: ACPClientCapabilities = {
    readTextFile: false,
    writeTextFile: false,
    terminal: false,
  };

  constructor(options: ACPServerOptions) {
    this.config = parseACPConfig(options.config ?? {});
    this.handler = options.handler;
    this.sessions = new SessionManager(this.config.maxSessions);
    this.transportInstance = options.transport ?? new StdioTransport();
  }

  /**
   * Start the ACP server. Creates the transport stream and begins
   * listening for JSON-RPC messages. Idempotent.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    // Lazy-load SDK to keep constructor synchronous (Decision #15)
    const { AgentSideConnection } = await import("@agentclientprotocol/sdk");

    const stream = this.transportInstance.createStream();
    const agent = this.createAgent();

    this.connection = new AgentSideConnection(() => agent, stream);
    this.connected = true;
  }

  /**
   * Disconnect and clean up all sessions and transport.
   * Idempotent.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.sessions.clear();
    this.transportInstance.close();
    this.connected = false;
    this.connection = undefined;
  }

  /** Whether the server is currently connected. */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Promise that resolves when the connection closes.
   * Only valid after connect().
   */
  get closed(): Promise<void> | undefined {
    return this.connection?.closed;
  }

  // -----------------------------------------------------------------------
  // Agent implementation (ACP protocol methods)
  // -----------------------------------------------------------------------

  private createAgent(): Agent {
    return {
      initialize: (params) => this.handleInitialize(params),
      newSession: (params) => this.handleNewSession(params),
      prompt: (params) => this.handlePrompt(params),
      cancel: (params) => this.handleCancel(params),
      authenticate: (_params) => this.handleAuthenticate(_params),
      setSessionMode: (params) => this.handleSetSessionMode(params),
    };
  }

  private async handleInitialize(params: InitializeRequest): Promise<InitializeResponse> {
    // Extract client capabilities for context building
    const caps = params.clientCapabilities;
    this.clientCapabilities = {
      readTextFile: caps?.fs?.readTextFile === true,
      writeTextFile: caps?.fs?.writeTextFile === true,
      terminal: caps?.terminal === true,
    };

    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: this.config.supportLoadSession,
        promptCapabilities: {
          image: this.config.acceptImages,
          audio: this.config.acceptAudio,
          embeddedContext: this.config.acceptResources,
        },
      },
      agentInfo: {
        name: this.config.agentName,
        title: this.config.agentName,
        version: this.config.agentVersion,
      },
    };
  }

  private async handleNewSession(_params: NewSessionRequest): Promise<NewSessionResponse> {
    const session = this.sessions.create();
    return { sessionId: session.id };
  }

  private async handlePrompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw RequestError.resourceNotFound(params.sessionId);
    }

    const controller = this.sessions.startPrompt(params.sessionId);
    const context = this.buildContext(params.sessionId);
    const promptBlocks = mapACPContentToBlocks(params.prompt);

    const emit = (event: SessionUpdate): void => {
      this.connection?.sessionUpdate({
        sessionId: params.sessionId,
        update: event,
      });
    };

    try {
      const stopReason: ACPStopReason = await this.handler(
        { sessionId: params.sessionId, prompt: promptBlocks },
        context,
        emit,
        controller.signal,
      );
      return { stopReason };
    } catch (err) {
      if (controller.signal.aborted) {
        return { stopReason: "cancelled" };
      }
      throw err;
    } finally {
      this.sessions.endPrompt(params.sessionId);
    }
  }

  private async handleCancel(params: CancelNotification): Promise<void> {
    this.sessions.cancelPrompt(params.sessionId);
  }

  private async handleAuthenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse> {
    // No auth required by default
    return {};
  }

  private async handleSetSessionMode(
    _params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse> {
    // Mode changes not implemented in MVP
    return {};
  }

  // -----------------------------------------------------------------------
  // Context builder
  // -----------------------------------------------------------------------

  private buildContext(sessionId: string): ACPContext {
    const conn = this.connection;
    if (!conn) {
      throw new Error("ACP connection not available");
    }

    return {
      readFile: async (path: string) => {
        const resp = await conn.readTextFile({ sessionId, path });
        return resp.content;
      },
      writeFile: async (path: string, content: string) => {
        await conn.writeTextFile({ sessionId, path, content });
      },
      createTerminal: async (command: string, args?: readonly string[]) => {
        return conn.createTerminal({
          sessionId,
          command,
          args: args ? [...args] : [],
        });
      },
      requestPermission: async (params: RequestPermissionRequest) => {
        const resp = await conn.requestPermission(params);
        return resp.outcome;
      },
      clientCapabilities: { ...this.clientCapabilities },
      connectionSignal: conn.signal,
    };
  }
}
