import { describe, expect, it } from "vitest";
import { URL_RULES } from "../../rules/url.js";
import type { SanitizationRule } from "../../types.js";

const [dangerousProtocolRule, ssrfRule] = [...URL_RULES] as [SanitizationRule, SanitizationRule];

describe("dangerous-url-protocol rule", () => {
  it("detects javascript: URLs", () => {
    const violations = dangerousProtocolRule.test("Click javascript:alert(1)");
    expect(violations.length).toBe(1);
    expect(violations[0]?.severity).toBe("critical");
  });

  it("detects vbscript: URLs", () => {
    const violations = dangerousProtocolRule.test("Link: vbscript:run()");
    expect(violations.length).toBe(1);
  });

  it("detects data: URLs", () => {
    const violations = dangerousProtocolRule.test("Image: data:text/html,<script>x</script>");
    expect(violations.length).toBe(1);
  });

  it("detects file: URLs", () => {
    const violations = dangerousProtocolRule.test("Open file:///etc/passwd");
    expect(violations.length).toBe(1);
  });

  it("detects blob: URLs", () => {
    const violations = dangerousProtocolRule.test("Load blob:http://evil.com/abc");
    expect(violations.length).toBe(1);
  });

  it("is case-insensitive for JAVASCRIPT:", () => {
    const violations = dangerousProtocolRule.test("JAVASCRIPT:alert(document.cookie)");
    expect(violations.length).toBe(1);
  });

  it("allows http:// URLs", () => {
    const violations = dangerousProtocolRule.test("Visit http://example.com");
    expect(violations.length).toBe(0);
  });

  it("allows https:// URLs", () => {
    const violations = dangerousProtocolRule.test("Visit https://example.com/path");
    expect(violations.length).toBe(0);
  });

  it("allows mailto: URLs", () => {
    const violations = dangerousProtocolRule.test("Email mailto:user@example.com");
    expect(violations.length).toBe(0);
  });

  it("strips dangerous URLs preserving surrounding text", () => {
    const result = dangerousProtocolRule.strip("before javascript:alert(1) after");
    expect(result).toBe("before  after");
  });

  it("does not strip safe URLs", () => {
    const result = dangerousProtocolRule.strip("Visit https://example.com for details");
    expect(result).toContain("https://example.com");
  });
});

describe("ssrf-private-ip rule", () => {
  it("blocks localhost", () => {
    const violations = ssrfRule.test("Fetch http://localhost:3000/api");
    expect(violations.length).toBe(1);
    expect(violations[0]?.severity).toBe("high");
  });

  it("blocks 127.0.0.1", () => {
    const violations = ssrfRule.test("Fetch http://127.0.0.1:8080/internal");
    expect(violations.length).toBe(1);
  });

  it("blocks ::1 (IPv6 loopback)", () => {
    const violations = ssrfRule.test("Fetch http://[::1]:3000/api");
    expect(violations.length).toBe(1);
  });

  it("blocks 10.x.x.x range", () => {
    const violations = ssrfRule.test("Fetch http://10.0.0.1/secret");
    expect(violations.length).toBe(1);
  });

  it("blocks 172.16-31.x.x range", () => {
    const violations = ssrfRule.test("Fetch http://172.16.0.1/admin");
    expect(violations.length).toBe(1);
  });

  it("blocks 192.168.x.x range", () => {
    const violations = ssrfRule.test("Fetch http://192.168.1.1/router");
    expect(violations.length).toBe(1);
  });

  it("blocks 169.254.x.x (link-local)", () => {
    const violations = ssrfRule.test("Fetch http://169.254.169.254/metadata");
    expect(violations.length).toBe(1);
  });

  it("blocks 0.0.0.0", () => {
    const violations = ssrfRule.test("Fetch http://0.0.0.0:8080/");
    expect(violations.length).toBe(1);
  });

  it("allows public IP addresses", () => {
    const violations = ssrfRule.test("Fetch https://93.184.216.34/page");
    expect(violations.length).toBe(0);
  });

  it("allows public domains", () => {
    const violations = ssrfRule.test("Fetch https://api.example.com/data");
    expect(violations.length).toBe(0);
  });

  it("strips private IP URLs preserving surrounding text", () => {
    const result = ssrfRule.strip("fetch http://192.168.1.1/admin then proceed");
    expect(result).toBe("fetch  then proceed");
  });

  it("does not strip public URLs", () => {
    const result = ssrfRule.strip("fetch https://api.example.com/data");
    expect(result).toContain("https://api.example.com/data");
  });
});
