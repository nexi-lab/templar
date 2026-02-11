/**
 * Convert common text formatting to Slack mrkdwn.
 *
 * Handles:
 * - **bold** → *bold*
 * - *italic* / _italic_ → _italic_
 * - ~~strike~~ → ~strike~
 * - [text](url) → <url|text>
 * - # Heading → *Heading*
 * - HTML tags (<b>, <i>, <s>, <a>) → mrkdwn equivalents
 * - Code blocks and inline code pass through unchanged
 */
export function toMrkdwn(text: string): string {
  if (text.length === 0) return text;

  // Protect code blocks and inline code from conversion
  const codeBlocks: string[] = [];
  let processed = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  const inlineCodes: string[] = [];
  processed = processed.replace(/`[^`]+`/g, (match) => {
    inlineCodes.push(match);
    return `\x00IC${inlineCodes.length - 1}\x00`;
  });

  // HTML tag conversions
  processed = processed.replace(/<b>([\s\S]*?)<\/b>/g, "*$1*");
  processed = processed.replace(/<strong>([\s\S]*?)<\/strong>/g, "*$1*");
  processed = processed.replace(/<i>([\s\S]*?)<\/i>/g, "_$1_");
  processed = processed.replace(/<em>([\s\S]*?)<\/em>/g, "_$1_");
  processed = processed.replace(/<s>([\s\S]*?)<\/s>/g, "~$1~");
  processed = processed.replace(/<strike>([\s\S]*?)<\/strike>/g, "~$1~");
  processed = processed.replace(/<del>([\s\S]*?)<\/del>/g, "~$1~");
  processed = processed.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, "<$1|$2>");

  // Markdown-style bold: **text** → *text*
  processed = processed.replace(/\*\*(.+?)\*\*/g, "*$1*");

  // Markdown-style italic: *text* (single asterisk, not already converted bold)
  // Only match single asterisks that are not adjacent to another asterisk
  // Skip this if it would conflict with already-converted bold markers

  // Markdown-style strikethrough: ~~text~~ → ~text~
  processed = processed.replace(/~~(.+?)~~/g, "~$1~");

  // Markdown-style links: [text](url) → <url|text>
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // Markdown headings: # Heading → *Heading*
  processed = processed.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Restore inline code
  for (let i = 0; i < inlineCodes.length; i++) {
    const code = inlineCodes[i];
    if (code != null) processed = processed.replace(`\x00IC${i}\x00`, code);
  }

  // Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    const block = codeBlocks[i];
    if (block != null) processed = processed.replace(`\x00CB${i}\x00`, block);
  }

  return processed;
}

/**
 * Generate a plain text fallback from mrkdwn.
 * Strips formatting markers for use in notification text.
 */
export function mrkdwnToPlainText(mrkdwn: string): string {
  let plain = mrkdwn;

  // Remove Slack links: <url|text> → text, <url> → url
  plain = plain.replace(/<([^|>]+)\|([^>]+)>/g, "$2");
  plain = plain.replace(/<([^>]+)>/g, "$1");

  // Remove formatting markers
  plain = plain.replace(/\*([^*]+)\*/g, "$1");
  plain = plain.replace(/_([^_]+)_/g, "$1");
  plain = plain.replace(/~([^~]+)~/g, "$1");

  // Remove code blocks markers
  plain = plain.replace(/```[\s\S]*?```/g, (match) => match.slice(3, -3));
  plain = plain.replace(/`([^`]+)`/g, "$1");

  return plain;
}
