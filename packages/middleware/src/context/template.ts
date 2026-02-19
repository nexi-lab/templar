/**
 * Template variable substitution for context hydration (#59).
 *
 * Replaces `{{key.path}}` placeholders with values from the vars object.
 * Unknown variables are left as literal `{{key}}` with a console.warn.
 */

import type { HydrationTemplateVars } from "@templar/core";

const TEMPLATE_REGEX = /\{\{(\w+(?:\.\w+)*)\}\}/g;

/** Allowed top-level variable names — fixed set only. */
const ALLOWED_TOP_LEVEL = new Set(["task", "workspace", "agent", "user", "session"]);

/**
 * Resolve a dot-separated path on the vars object.
 * Returns undefined if any segment is missing or disallowed.
 */
function resolvePath(obj: Record<string, unknown>, path: string): string | undefined {
  const segments = path.split(".");
  // Only allow known top-level keys
  if (segments.length === 0 || !ALLOWED_TOP_LEVEL.has(segments[0]!)) {
    return undefined;
  }

  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    // Guard against prototype pollution
    if (!Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current === null || current === undefined ? undefined : String(current);
}

/**
 * Interpolate `{{key.path}}` template variables in a string.
 *
 * - Dot-path traversal on the vars object (e.g., `{{task.description}}`)
 * - Unknown variables left as literal + console.warn
 * - Fixed variable set only (task, workspace, agent, user, session)
 */
export function interpolateTemplate(template: string, vars: HydrationTemplateVars): string {
  return template.replace(TEMPLATE_REGEX, (match, path: string) => {
    const value = resolvePath(vars as unknown as Record<string, unknown>, path);
    if (value === undefined) {
      console.warn(`[context-hydrator] Unknown template variable: ${match}`);
      return match;
    }
    return value;
  });
}
