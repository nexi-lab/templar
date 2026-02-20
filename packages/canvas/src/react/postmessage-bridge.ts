/**
 * postMessage bridge script injected into sandboxed iframes.
 *
 * Security model:
 * - Primary control: `sandbox="allow-scripts"` WITHOUT `allow-same-origin`
 *   prevents iframe from accessing parent DOM, cookies, storage, or APIs.
 * - CSP meta tag is defense-in-depth only — browser support for CSP meta
 *   in srcdoc iframes is inconsistent. Do NOT rely on it as primary control.
 * - postMessage uses `"*"` as target origin because sandboxed srcdoc iframes
 *   have a `null` origin, making specific target origins impossible.
 *   The parent validates messages by checking `event.source === iframe.contentWindow`.
 *
 * Bridge protocol (one-way: iframe -> parent):
 * - `ready`: sent on script initialization
 * - `resize`: sent on body size changes via ResizeObserver
 * - `error`: sent on uncaught window errors
 */

export const BRIDGE_SCRIPT = `<script>
(function() {
  window.parent.postMessage({ type: "ready" }, "*");

  var ro = new ResizeObserver(function() {
    var height = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: "resize", height: height }, "*");
  });
  ro.observe(document.body);

  window.onerror = function(msg) {
    window.parent.postMessage({ type: "error", message: String(msg) }, "*");
  };
})();
</script>`;

/**
 * CSP meta tag — defense-in-depth only.
 * The real security boundary is `sandbox="allow-scripts"` without `allow-same-origin`.
 */
export const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`;

export function buildSrcdoc(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>${CSP_META}</head>
<body>${content}${BRIDGE_SCRIPT}</body>
</html>`;
}
