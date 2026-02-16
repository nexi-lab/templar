/**
 * Content truncation with head/tail split and informational marker.
 *
 * When a bootstrap file exceeds its character budget, it is truncated
 * with a head/tail split: ~78% head, ~22% tail of available space
 * (after marker overhead). The truncation marker sits between head and tail.
 */

export interface TruncateOptions {
  readonly budget: number;
  readonly filePath: string;
}

export interface TruncateResult {
  readonly content: string;
  readonly originalSize: number;
  readonly truncated: boolean;
}

/**
 * Truncates content to fit within a character budget.
 *
 * If content fits, returns it unchanged. Otherwise, keeps head + tail
 * with a marker indicating how many characters were dropped.
 */
export function truncateContent(content: string, options: TruncateOptions): TruncateResult {
  if (content.length <= options.budget) {
    return { content, originalSize: content.length, truncated: false };
  }

  // Build the marker template and measure its overhead.
  // Use a generous placeholder for the dropped count to compute available space.
  const markerTemplate = `\n\n---\n[Truncated: {dropped} chars omitted from ${options.filePath}. Reduce file size for full content.]\n`;
  const markerOverhead = markerTemplate.replace("{dropped}", "99999").length;

  const available = options.budget - markerOverhead;
  if (available <= 0) {
    // Budget is too small even for the marker — return empty with marker
    const marker = markerTemplate.replace("{dropped}", String(content.length));
    return {
      content: marker.slice(0, options.budget),
      originalSize: content.length,
      truncated: true,
    };
  }

  const headSize = Math.floor(available * 0.78);
  const tailSize = available - headSize;

  const head = content.slice(0, headSize);
  const tail = content.slice(-tailSize);
  const dropped = content.length - headSize - tailSize;
  const marker = markerTemplate.replace("{dropped}", String(dropped));

  return {
    content: head + marker + tail,
    originalSize: content.length,
    truncated: true,
  };
}
