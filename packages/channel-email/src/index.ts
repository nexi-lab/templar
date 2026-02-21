export { EmailChannel, EmailChannel as default } from "./adapter.js";
export { EMAIL_CAPABILITIES } from "./capabilities.js";
export type { EmailConfig, GmailConfig, ImapSmtpConfig } from "./config.js";
export { createEmailMessage } from "./helpers.js";
export type {
  EmailAddress,
  EmailAttachment,
  EmailProvider,
  RawEmail,
} from "./providers/types.js";
