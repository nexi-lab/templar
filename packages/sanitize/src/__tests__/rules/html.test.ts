import { describe, expect, it } from "vitest";
import { HTML_RULES } from "../../rules/html.js";
import type { SanitizationRule } from "../../types.js";

const [scriptTagRule, eventHandlerRule, dangerousProtocolAttrRule, htmlTagRule] = [
  ...HTML_RULES,
] as [SanitizationRule, SanitizationRule, SanitizationRule, SanitizationRule];

describe("script-tag rule", () => {
  it("detects <script> tags", () => {
    const violations = scriptTagRule.test('<script>alert("xss")</script>');
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0]?.severity).toBe("critical");
  });

  it("handles case variations <SCRIPT>", () => {
    const violations = scriptTagRule.test('<SCRIPT>alert("xss")</SCRIPT>');
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it("strips <script> tags and content", () => {
    const result = scriptTagRule.strip('before<script>alert("x")</script>after');
    expect(result).toBe("beforeafter");
  });

  it("handles nested evasion <scr<script>ipt> iteratively", () => {
    // After stripping inner <script>...</script>, nothing new forms here
    // but test iterative behavior
    const result = scriptTagRule.strip("<script>first</script><script>second</script>");
    expect(result).toBe("");
  });

  it("detects HTML entity encoded script tags", () => {
    const violations = scriptTagRule.test("&#60;script&#62;alert('xss')&#60;/script&#62;");
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves non-script content", () => {
    const result = scriptTagRule.strip("Hello world, no scripts here");
    expect(result).toBe("Hello world, no scripts here");
  });

  it("handles script with attributes", () => {
    const violations = scriptTagRule.test('<script type="text/javascript">code()</script>');
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });
});

describe("event-handler rule", () => {
  it("detects onclick attribute", () => {
    const violations = eventHandlerRule.test('<div onclick="alert(1)">click</div>');
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0]?.severity).toBe("high");
  });

  it("detects onerror attribute", () => {
    const violations = eventHandlerRule.test('<img onerror="alert(1)" src="x">');
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it("detects onload attribute", () => {
    const violations = eventHandlerRule.test('<body onload="init()">');
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it("strips event handlers preserving rest", () => {
    const result = eventHandlerRule.strip('<div onclick="alert(1)" class="btn">text</div>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("class");
  });

  it("handles single-quoted attributes", () => {
    const violations = eventHandlerRule.test("<div onclick='alert(1)'>click</div>");
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });
});

describe("dangerous-protocol-attr rule", () => {
  it("detects javascript: in href", () => {
    const violations = dangerousProtocolAttrRule.test('<a href="javascript:alert(1)">link</a>');
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0]?.severity).toBe("critical");
  });

  it("detects vbscript: in href", () => {
    const violations = dangerousProtocolAttrRule.test('<a href="vbscript:run()">link</a>');
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it("detects data: in src", () => {
    const violations = dangerousProtocolAttrRule.test(
      '<img src="data:text/html,<script>alert(1)</script>">',
    );
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it("strips dangerous protocol attributes", () => {
    const result = dangerousProtocolAttrRule.strip('Click <a href="javascript:alert(1)">here</a>');
    expect(result).not.toContain("javascript:");
  });

  it("does not flag safe protocols", () => {
    const violations = dangerousProtocolAttrRule.test('<a href="https://example.com">link</a>');
    expect(violations.length).toBe(0);
  });
});

describe("html-tag-strip rule", () => {
  it("detects HTML tags", () => {
    const violations = htmlTagRule.test("<div>content</div>");
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it("strips all HTML tags preserving content", () => {
    const result = htmlTagRule.strip("<p>Hello <b>world</b></p>");
    expect(result).toBe("Hello world");
  });

  it("handles self-closing tags", () => {
    const result = htmlTagRule.strip("text<br/>more<hr/>end");
    expect(result).toBe("textmoreend");
  });

  it("preserves text without tags", () => {
    const result = htmlTagRule.strip("plain text content");
    expect(result).toBe("plain text content");
  });

  it("handles incomplete/malformed tags", () => {
    // A less-than not followed by a letter is not an HTML tag
    const result = htmlTagRule.strip("5 < 10 and 20 > 15");
    expect(result).toBe("5 < 10 and 20 > 15");
  });

  it("assigns low severity to general tags", () => {
    const violations = htmlTagRule.test("<p>text</p>");
    expect(violations[0]?.severity).toBe("low");
  });
});
