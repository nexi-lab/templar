import { ChannelLoadError } from "@templar/errors";
import { z } from "zod";
import type { AuthStateProvider } from "./auth-state.js";

// ---------------------------------------------------------------------------
// Connection state updates emitted to consumers
// ---------------------------------------------------------------------------

export interface ConnectionUpdate {
  readonly status: "connecting" | "open" | "reconnecting" | "failed" | "closed";
  readonly qr?: string;
  readonly attempt?: number;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Config types — hand-written to satisfy exactOptionalPropertyTypes
// ---------------------------------------------------------------------------

export interface WhatsAppConfig {
  // Auth
  readonly authStatePath: string;
  readonly authStateProvider: AuthStateProvider | undefined;

  // Connection
  readonly printQRInTerminal: boolean;
  readonly browser: readonly [string, string, string];
  readonly connectTimeoutMs: number;

  // Reconnection
  readonly maxReconnectAttempts: number;
  readonly reconnectBaseDelay: number;
  readonly reconnectMaxDelay: number;

  // Rate limiting
  readonly messageDelay: number;
  readonly burstLimit: number;
  readonly jitter: number;

  // History sync
  readonly syncHistory: boolean;

  // Callbacks (not validated by Zod — passed through as-is)
  readonly onQR: ((qr: string) => void) | undefined;
  readonly onConnectionUpdate: ((update: ConnectionUpdate) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_AUTH_STATE_PATH = ".whatsapp-auth";
const DEFAULT_BROWSER: readonly [string, string, string] = ["Templar", "Chrome", "22.0"];
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_RECONNECT_BASE_DELAY = 2_000;
const DEFAULT_RECONNECT_MAX_DELAY = 60_000;
const DEFAULT_MESSAGE_DELAY = 3_000;
const DEFAULT_BURST_LIMIT = 5;
const DEFAULT_JITTER = 0.2;

// ---------------------------------------------------------------------------
// Zod schema (validates serializable config only; callbacks are extracted)
// ---------------------------------------------------------------------------

const WhatsAppConfigSchema = z.object({
  authStatePath: z.string().min(1).optional(),
  printQRInTerminal: z.boolean().optional(),
  browser: z.tuple([z.string(), z.string(), z.string()]).optional(),
  connectTimeoutMs: z.number().int().positive().optional(),
  maxReconnectAttempts: z.number().int().min(0).optional(),
  reconnectBaseDelay: z.number().int().positive().optional(),
  reconnectMaxDelay: z.number().int().positive().optional(),
  messageDelay: z.number().int().min(0).optional(),
  burstLimit: z.number().int().positive().optional(),
  jitter: z.number().min(0).max(1).optional(),
  syncHistory: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse and validate raw config into a typed WhatsAppConfig.
 * Applies safe defaults for all optional fields.
 * Throws ChannelLoadError on validation failure.
 */
export function parseWhatsAppConfig(raw: Readonly<Record<string, unknown>>): WhatsAppConfig {
  // Extract non-serializable callbacks before Zod validation
  const onQR = typeof raw.onQR === "function" ? (raw.onQR as (qr: string) => void) : undefined;
  const onConnectionUpdate =
    typeof raw.onConnectionUpdate === "function"
      ? (raw.onConnectionUpdate as (update: ConnectionUpdate) => void)
      : undefined;
  const authStateProvider =
    raw.authStateProvider != null &&
    typeof raw.authStateProvider === "object" &&
    "getState" in raw.authStateProvider
      ? (raw.authStateProvider as AuthStateProvider)
      : undefined;

  // Strip non-serializable fields before Zod parse
  const { onQR: _, onConnectionUpdate: __, authStateProvider: ___, ...serializable } = raw;

  const result = WhatsAppConfigSchema.safeParse(serializable);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ChannelLoadError("whatsapp", `Invalid config: ${issues}`);
  }

  const parsed = result.data;

  return {
    authStatePath: parsed.authStatePath ?? DEFAULT_AUTH_STATE_PATH,
    authStateProvider,
    printQRInTerminal: parsed.printQRInTerminal ?? true,
    browser: parsed.browser
      ? ([parsed.browser[0], parsed.browser[1], parsed.browser[2]] as const)
      : DEFAULT_BROWSER,
    connectTimeoutMs: parsed.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    maxReconnectAttempts: parsed.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
    reconnectBaseDelay: parsed.reconnectBaseDelay ?? DEFAULT_RECONNECT_BASE_DELAY,
    reconnectMaxDelay: parsed.reconnectMaxDelay ?? DEFAULT_RECONNECT_MAX_DELAY,
    messageDelay: parsed.messageDelay ?? DEFAULT_MESSAGE_DELAY,
    burstLimit: parsed.burstLimit ?? DEFAULT_BURST_LIMIT,
    jitter: parsed.jitter ?? DEFAULT_JITTER,
    syncHistory: parsed.syncHistory ?? false,
    onQR,
    onConnectionUpdate,
  };
}
