import { ChannelLoadError } from "@templar/errors";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth schemas (shared between providers)
// ---------------------------------------------------------------------------

const PasswordOrTokenAuth = z
  .object({
    user: z.string().min(1, "Auth user is required"),
    pass: z.string().min(1).optional(),
    accessToken: z.string().min(1).optional(),
  })
  .refine((data) => data.pass !== undefined || data.accessToken !== undefined, {
    message: "Either 'pass' or 'accessToken' must be provided",
  });

// ---------------------------------------------------------------------------
// Gmail provider config
// ---------------------------------------------------------------------------

const OAuth2Credentials = z.object({
  type: z.literal("oauth2"),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
});

const ServiceAccountCredentials = z.object({
  type: z.literal("service-account"),
  serviceAccountKey: z.string().min(1),
});

const GmailCredentials = z.discriminatedUnion("type", [
  OAuth2Credentials,
  ServiceAccountCredentials,
]);

const GmailConfigSchema = z.object({
  provider: z.literal("gmail"),
  credentials: GmailCredentials,
  user: z.string().email("user must be a valid email"),
  pollingInterval: z.number().min(10_000, "pollingInterval must be >= 10000ms").default(30_000),
  maxEmailSize: z.number().positive().default(25_000_000),
});

// ---------------------------------------------------------------------------
// IMAP/SMTP provider config
// ---------------------------------------------------------------------------

const SmtpPoolConfig = z.object({
  maxConnections: z.number().positive().default(3),
  maxMessages: z.number().positive().default(50),
  rateDelta: z.number().positive().default(1000),
  rateLimit: z.number().positive().default(5),
});

const ImapConfig = z.object({
  host: z.string().min(1, "IMAP host is required"),
  port: z.number().positive().default(993),
  secure: z.boolean().default(true),
  auth: PasswordOrTokenAuth,
});

const SmtpConfig = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.number().positive().default(587),
  secure: z.boolean().default(false),
  auth: PasswordOrTokenAuth,
  pool: SmtpPoolConfig.default({}),
});

const ImapSmtpConfigSchema = z.object({
  provider: z.literal("imap-smtp"),
  imap: ImapConfig,
  smtp: SmtpConfig,
  maxEmailSize: z.number().positive().default(25_000_000),
  mailbox: z.string().default("INBOX"),
});

// ---------------------------------------------------------------------------
// Combined config (discriminated union)
// ---------------------------------------------------------------------------

const EmailConfigSchema = z.discriminatedUnion("provider", [
  GmailConfigSchema,
  ImapSmtpConfigSchema,
]);

export type GmailConfig = z.infer<typeof GmailConfigSchema>;
export type ImapSmtpConfig = z.infer<typeof ImapSmtpConfigSchema>;
export type EmailConfig = z.infer<typeof EmailConfigSchema>;

/**
 * Parse and validate raw config into a typed EmailConfig.
 * Throws ChannelLoadError on validation failure.
 */
export function parseEmailConfig(raw: Readonly<Record<string, unknown>>): EmailConfig {
  const result = EmailConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ChannelLoadError("email", `Invalid config: ${issues}`);
  }
  return result.data;
}
