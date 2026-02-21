import { describe, expect, it } from "vitest";
import { type GmailConfig, type ImapSmtpConfig, parseEmailConfig } from "../../config.js";

describe("parseEmailConfig", () => {
  // -----------------------------------------------------------------------
  // Gmail provider — valid configs
  // -----------------------------------------------------------------------
  describe("gmail provider", () => {
    it("accepts a valid OAuth2 Gmail config", () => {
      const config = parseEmailConfig({
        provider: "gmail",
        credentials: {
          type: "oauth2",
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token",
        },
        user: "agent@example.com",
      });
      expect(config).toEqual({
        provider: "gmail",
        credentials: {
          type: "oauth2",
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token",
        },
        user: "agent@example.com",
        pollingInterval: 30_000,
        maxEmailSize: 25_000_000,
      });
    });

    it("accepts a valid service-account Gmail config", () => {
      const config = parseEmailConfig({
        provider: "gmail",
        credentials: {
          type: "service-account",
          serviceAccountKey: '{"type":"service_account"}',
        },
        user: "agent@example.com",
      });
      expect(config.provider).toBe("gmail");
      expect((config as GmailConfig).credentials.type).toBe("service-account");
    });

    it("allows custom pollingInterval and maxEmailSize", () => {
      const config = parseEmailConfig({
        provider: "gmail",
        credentials: {
          type: "oauth2",
          clientId: "c",
          clientSecret: "s",
          refreshToken: "r",
        },
        user: "agent@example.com",
        pollingInterval: 60_000,
        maxEmailSize: 10_000_000,
      });
      expect((config as GmailConfig).pollingInterval).toBe(60_000);
      expect((config as GmailConfig).maxEmailSize).toBe(10_000_000);
    });

    it("rejects pollingInterval below 10s", () => {
      expect(() =>
        parseEmailConfig({
          provider: "gmail",
          credentials: {
            type: "oauth2",
            clientId: "c",
            clientSecret: "s",
            refreshToken: "r",
          },
          user: "agent@example.com",
          pollingInterval: 5_000,
        }),
      ).toThrow("Invalid config");
    });

    it("rejects missing user field", () => {
      expect(() =>
        parseEmailConfig({
          provider: "gmail",
          credentials: {
            type: "oauth2",
            clientId: "c",
            clientSecret: "s",
            refreshToken: "r",
          },
        }),
      ).toThrow("Invalid config");
    });

    it("rejects invalid email format for user", () => {
      expect(() =>
        parseEmailConfig({
          provider: "gmail",
          credentials: {
            type: "oauth2",
            clientId: "c",
            clientSecret: "s",
            refreshToken: "r",
          },
          user: "not-an-email",
        }),
      ).toThrow("Invalid config");
    });
  });

  // -----------------------------------------------------------------------
  // IMAP/SMTP provider — valid configs
  // -----------------------------------------------------------------------
  describe("imap-smtp provider", () => {
    const validImapSmtp = {
      provider: "imap-smtp" as const,
      imap: {
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: { user: "agent@example.com", pass: "password" },
      },
      smtp: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: "agent@example.com", pass: "password" },
      },
    };

    it("accepts a valid IMAP/SMTP config with defaults", () => {
      const config = parseEmailConfig(validImapSmtp);
      expect(config).toEqual({
        ...validImapSmtp,
        smtp: {
          ...validImapSmtp.smtp,
          pool: {
            maxConnections: 3,
            maxMessages: 50,
            rateDelta: 1000,
            rateLimit: 5,
          },
        },
        maxEmailSize: 25_000_000,
        mailbox: "INBOX",
      });
    });

    it("accepts custom SMTP pool settings", () => {
      const config = parseEmailConfig({
        ...validImapSmtp,
        smtp: {
          ...validImapSmtp.smtp,
          pool: { maxConnections: 5, maxMessages: 100, rateDelta: 2000, rateLimit: 10 },
        },
      });
      expect((config as ImapSmtpConfig).smtp.pool.maxConnections).toBe(5);
    });

    it("accepts accessToken auth", () => {
      const config = parseEmailConfig({
        ...validImapSmtp,
        imap: {
          ...validImapSmtp.imap,
          auth: { user: "agent@example.com", accessToken: "token-123" },
        },
      });
      expect((config as ImapSmtpConfig).imap.auth.accessToken).toBe("token-123");
    });

    it("allows custom mailbox", () => {
      const config = parseEmailConfig({
        ...validImapSmtp,
        mailbox: "Sent",
      });
      expect((config as ImapSmtpConfig).mailbox).toBe("Sent");
    });

    it("rejects missing imap host", () => {
      expect(() =>
        parseEmailConfig({
          ...validImapSmtp,
          imap: { ...validImapSmtp.imap, host: "" },
        }),
      ).toThrow("Invalid config");
    });

    it("rejects missing smtp host", () => {
      expect(() =>
        parseEmailConfig({
          ...validImapSmtp,
          smtp: { ...validImapSmtp.smtp, host: "" },
        }),
      ).toThrow("Invalid config");
    });

    it("rejects missing auth user", () => {
      expect(() =>
        parseEmailConfig({
          ...validImapSmtp,
          imap: { ...validImapSmtp.imap, auth: { user: "" } },
        }),
      ).toThrow("Invalid config");
    });
  });

  // -----------------------------------------------------------------------
  // Invalid provider type
  // -----------------------------------------------------------------------
  describe("invalid configs", () => {
    it("rejects unknown provider type", () => {
      expect(() => parseEmailConfig({ provider: "outlook" })).toThrow("Invalid config");
    });

    it("rejects empty config", () => {
      expect(() => parseEmailConfig({})).toThrow("Invalid config");
    });

    it("rejects missing provider field", () => {
      expect(() => parseEmailConfig({ user: "test@test.com" })).toThrow("Invalid config");
    });
  });
});
