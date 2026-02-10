import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SECRET_PATTERNS,
  buildRedactionPatterns,
  PII_PATTERNS,
  redactSecrets,
  serializeAndRedact,
  truncatePayload,
} from "../redaction.js";
import type { RedactionPattern } from "../types.js";

describe("redactSecrets", () => {
  describe("built-in secret patterns", () => {
    it("should redact Bearer tokens", () => {
      const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    });

    it("should redact sk- API keys", () => {
      const text = "Using key sk-abc123def456ghi789jkl012mno";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("sk-abc123def456ghi789jkl012mno");
    });

    it("should redact PostgreSQL connection strings", () => {
      const text = "DB_URL=postgresql://user:pass@host:5432/mydb";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("user:pass");
    });

    it("should redact MySQL connection strings", () => {
      const text = "mysql://admin:secret@localhost:3306/app";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("admin:secret");
    });

    it("should redact MongoDB connection strings", () => {
      const text = "MONGO=mongodb+srv://user:pass@cluster.mongodb.net/db";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("user:pass");
    });

    it("should redact Redis connection strings", () => {
      const text = "REDIS_URL=redis://default:password@redis.example.com:6379";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("password");
    });

    it("should redact PEM private keys", () => {
      const text = "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJ\n-----END RSA PRIVATE KEY-----";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("MIIBogIBAAJ");
    });

    it("should redact AWS access keys", () => {
      const text = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
    });

    it("should redact AWS secret keys", () => {
      const text = "aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("wJalrXUtnFEMI");
    });

    it("should redact generic passwords", () => {
      const text = "password=MySuperSecret123!";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("MySuperSecret123!");
    });

    it("should redact multiple secrets in one string", () => {
      const text = "Bearer abc123token key=sk-xxxxxxxxxxxxxxxxxxxxxxxxxx db=postgres://u:p@h/d";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).not.toContain("abc123token");
      expect(result).not.toContain("sk-xxxxxxxxxxxxxxxxxxxxxxxxxx");
      expect(result).not.toContain("u:p@h/d");
    });

    it("should be case insensitive where appropriate", () => {
      const text = "BEARER eyJtoken123 and bearer AnotherToken456";
      const result = redactSecrets(text, BUILT_IN_SECRET_PATTERNS);
      expect(result).not.toContain("eyJtoken123");
      expect(result).not.toContain("AnotherToken456");
    });
  });

  describe("PII patterns", () => {
    it("should redact email addresses", () => {
      const text = "Contact john.doe@example.com for info";
      const result = redactSecrets(text, PII_PATTERNS);
      expect(result).toContain("[EMAIL_REDACTED]");
      expect(result).not.toContain("john.doe@example.com");
    });

    it("should redact US phone numbers", () => {
      const text = "Call me at (555) 123-4567";
      const result = redactSecrets(text, PII_PATTERNS);
      expect(result).toContain("[PHONE_REDACTED]");
      expect(result).not.toContain("123-4567");
    });

    it("should redact SSN numbers", () => {
      const text = "SSN: 123-45-6789";
      const result = redactSecrets(text, PII_PATTERNS);
      expect(result).toContain("[SSN_REDACTED]");
      expect(result).not.toContain("123-45-6789");
    });

    it("should redact date of birth", () => {
      const text = "DOB=01/15/1990";
      const result = redactSecrets(text, PII_PATTERNS);
      expect(result).toContain("[DOB_REDACTED]");
      expect(result).not.toContain("01/15/1990");
    });

    it("should redact multiple PII in one string", () => {
      const text = "Email: user@test.com Phone: 555-123-4567 SSN: 111-22-3333";
      const result = redactSecrets(text, PII_PATTERNS);
      expect(result).toContain("[EMAIL_REDACTED]");
      expect(result).toContain("[PHONE_REDACTED]");
      expect(result).toContain("[SSN_REDACTED]");
    });
  });

  describe("custom patterns", () => {
    it("should apply a single custom pattern", () => {
      const patterns: RedactionPattern[] = [{ name: "internal_id", pattern: /ID-[A-Z0-9]{8}/g }];
      const result = redactSecrets("Found ID-ABC12345 in logs", patterns);
      expect(result).toBe("Found [REDACTED] in logs");
    });

    it("should apply multiple custom patterns", () => {
      const patterns: RedactionPattern[] = [
        { name: "token", pattern: /tok_[a-z0-9]+/g },
        { name: "ref", pattern: /ref_[a-z0-9]+/g },
      ];
      const result = redactSecrets("token=tok_abc123 ref=ref_xyz789", patterns);
      expect(result).toBe("token=[REDACTED] ref=[REDACTED]");
    });

    it("should use custom replacement text", () => {
      const patterns: RedactionPattern[] = [
        { name: "secret", pattern: /SECRET_\w+/g, replacement: "***HIDDEN***" },
      ];
      const result = redactSecrets("value is SECRET_XYZ", patterns);
      expect(result).toBe("value is ***HIDDEN***");
    });

    it("should handle patterns with regex special characters", () => {
      const patterns: RedactionPattern[] = [
        { name: "version", pattern: /v\d+\.\d+\.\d+/g, replacement: "[VERSION]" },
      ];
      const result = redactSecrets("Running v1.2.3 in production", patterns);
      expect(result).toBe("Running [VERSION] in production");
    });
  });
});

describe("truncatePayload", () => {
  it("should return text unchanged when under maxSize", () => {
    const text = "short text";
    expect(truncatePayload(text, 100)).toBe(text);
  });

  it("should truncate text when over maxSize", () => {
    const text = "a".repeat(200);
    const result = truncatePayload(text, 50);
    expect(result).toHaveLength(50 + "...[TRUNCATED]".length);
    expect(result.endsWith("...[TRUNCATED]")).toBe(true);
  });

  it("should return text unchanged when exactly at maxSize", () => {
    const text = "a".repeat(100);
    expect(truncatePayload(text, 100)).toBe(text);
  });

  it("should handle empty string", () => {
    expect(truncatePayload("", 100)).toBe("");
  });
});

describe("serializeAndRedact", () => {
  it("should serialize objects to JSON", () => {
    const result = serializeAndRedact({ key: "value" }, [], 10000);
    expect(result).toBe('{"key":"value"}');
  });

  it("should truncate before redacting", () => {
    const payload = { secret: "Bearer longtoken123456789" };
    const result = serializeAndRedact(payload, BUILT_IN_SECRET_PATTERNS, 20);
    // Truncated first, then redacted
    expect(result.length).toBeLessThanOrEqual(20 + "...[TRUNCATED]".length + 50);
  });

  it("should redact secrets in serialized output", () => {
    const payload = { auth: "Bearer eyJhbGciOiJIUzI1NiJ9.token" };
    const result = serializeAndRedact(payload, BUILT_IN_SECRET_PATTERNS, 10000);
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(result).toContain("[REDACTED]");
  });

  it("should handle null payload", () => {
    const result = serializeAndRedact(null, [], 10000);
    expect(result).toBe("null");
  });

  it("should handle undefined payload", () => {
    // JSON.stringify(undefined) returns undefined, so it goes to String()
    const result = serializeAndRedact(undefined, [], 10000);
    expect(result).toBe("undefined");
  });

  it("should handle circular references gracefully", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = serializeAndRedact(obj, [], 10000);
    expect(result).toBe("[object Object]");
  });

  it("should handle very long strings", () => {
    const payload = "x".repeat(100_000);
    const result = serializeAndRedact(payload, [], 32768);
    expect(result.length).toBeLessThanOrEqual(32768 + "...[TRUNCATED]".length + 10);
  });
});

describe("buildRedactionPatterns", () => {
  it("should include built-in patterns when redactSecrets is true", () => {
    const patterns = buildRedactionPatterns(true, false, []);
    expect(patterns.length).toBe(BUILT_IN_SECRET_PATTERNS.length);
  });

  it("should exclude built-in patterns when redactSecrets is false", () => {
    const patterns = buildRedactionPatterns(false, false, []);
    expect(patterns.length).toBe(0);
  });

  it("should include PII patterns when detectPII is true", () => {
    const patterns = buildRedactionPatterns(false, true, []);
    expect(patterns.length).toBe(PII_PATTERNS.length);
  });

  it("should combine secrets and PII patterns", () => {
    const patterns = buildRedactionPatterns(true, true, []);
    expect(patterns.length).toBe(BUILT_IN_SECRET_PATTERNS.length + PII_PATTERNS.length);
  });

  it("should append custom patterns", () => {
    const custom: RedactionPattern[] = [{ name: "custom", pattern: /custom/g }];
    const patterns = buildRedactionPatterns(true, false, custom);
    expect(patterns.length).toBe(BUILT_IN_SECRET_PATTERNS.length + 1);
    expect(patterns[patterns.length - 1]?.name).toBe("custom");
  });

  it("should combine all three when all enabled", () => {
    const custom: RedactionPattern[] = [
      { name: "c1", pattern: /c1/g },
      { name: "c2", pattern: /c2/g },
    ];
    const patterns = buildRedactionPatterns(true, true, custom);
    expect(patterns.length).toBe(BUILT_IN_SECRET_PATTERNS.length + PII_PATTERNS.length + 2);
  });
});
