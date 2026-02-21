// ---------------------------------------------------------------------------
// Email address
// ---------------------------------------------------------------------------

export interface EmailAddress {
  readonly name?: string;
  readonly address: string;
}

// ---------------------------------------------------------------------------
// Email attachment
// ---------------------------------------------------------------------------

export interface EmailAttachment {
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly content: Buffer;
  readonly contentId?: string; // For inline images (CID)
  readonly disposition: "attachment" | "inline";
}

// ---------------------------------------------------------------------------
// RawEmail — provider-agnostic intermediate representation
// ---------------------------------------------------------------------------

/**
 * Shared email representation used as the anti-corruption layer
 * between providers (Gmail API / IMAP) and the normalizer/renderer.
 *
 * Each provider converts its native format to RawEmail.
 * The normalizer then converts RawEmail to InboundMessage.
 */
export interface RawEmail {
  readonly messageId: string;
  readonly from: EmailAddress;
  readonly to: readonly EmailAddress[];
  readonly cc?: readonly EmailAddress[];
  readonly bcc?: readonly EmailAddress[];
  readonly subject: string;
  readonly date: Date;
  readonly inReplyTo?: string;
  readonly references?: readonly string[];
  readonly textBody?: string;
  readonly htmlBody?: string;
  readonly attachments: readonly EmailAttachment[];
  readonly headers: ReadonlyMap<string, string>;
}

// ---------------------------------------------------------------------------
// RenderedEmail — output of the renderer, input to provider.send()
// ---------------------------------------------------------------------------

/**
 * Email ready to be sent via a provider. Matches nodemailer's mail options
 * shape for easy SMTP sending, while also being convertible to Gmail API format.
 */
export interface RenderedEmail {
  readonly from: string;
  readonly to: string;
  readonly cc?: string;
  readonly bcc?: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly inReplyTo?: string;
  readonly references?: string;
  readonly attachments: readonly RenderedAttachment[];
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RenderedAttachment {
  readonly filename: string;
  readonly content: Buffer | string; // Buffer for data, string for URL
  readonly contentType: string;
  readonly cid?: string; // Content-ID for inline images
  readonly contentDisposition?: "attachment" | "inline";
}

// ---------------------------------------------------------------------------
// EmailProvider — strategy interface
// ---------------------------------------------------------------------------

/**
 * Provider interface for the strategy pattern.
 * Implemented by GmailProvider and ImapSmtpProvider.
 */
export interface EmailProvider {
  readonly type: "gmail" | "imap-smtp";

  /** Open connection(s) to the email service */
  connect(): Promise<void>;

  /** Close all connections and clean up resources */
  disconnect(): Promise<void>;

  /** Register a handler for new incoming emails */
  listen(handler: (raw: RawEmail) => void): void;

  /** Send an email, returns the Message-ID */
  send(email: RenderedEmail): Promise<string>;

  /** Whether the provider is currently connected */
  isConnected(): boolean;
}
