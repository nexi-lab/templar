/**
 * AG-UI Server Configuration
 */

import { z } from "zod";

export const AgUiServerConfigSchema = z.object({
  /** Port to listen on (default: 18790) */
  port: z.number().int().positive().default(18790),

  /** Maximum concurrent SSE connections (default: 1000) */
  maxConnections: z.number().int().positive().default(1000),

  /** Maximum stream duration in milliseconds (default: 5 minutes) */
  maxStreamDurationMs: z.number().int().positive().default(300_000),

  /** Heartbeat interval in milliseconds (default: 15 seconds) */
  heartbeatIntervalMs: z.number().int().positive().default(15_000),

  /** Hostname to bind to (default: "0.0.0.0") */
  hostname: z.string().default("0.0.0.0"),
});

export type AgUiServerConfig = z.infer<typeof AgUiServerConfigSchema>;
