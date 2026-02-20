/**
 * Sandboxed iframe renderer for agent-generated HTML.
 *
 * - sandbox="allow-scripts" (NO allow-same-origin)
 * - CSP meta tag in srcdoc
 * - postMessage bridge for resize/action/error/ready
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasBridgeMessageSchema } from "../schemas.js";
import { buildSrcdoc } from "./postmessage-bridge.js";

export interface HtmlRendererProps {
  readonly content: string;
  readonly onAction?: ((action: string, payload?: unknown) => void) | undefined;
}

const MAX_IFRAME_HEIGHT = 5000;

export function HtmlRenderer({ content, onAction }: HtmlRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const srcdoc = buildSrcdoc(content);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Only accept messages from our iframe
      if (event.source !== iframeRef.current?.contentWindow) return;

      const parsed = CanvasBridgeMessageSchema.safeParse(event.data);
      if (!parsed.success) return;

      switch (parsed.data.type) {
        case "resize":
          setHeight(Math.min(parsed.data.height, MAX_IFRAME_HEIGHT));
          break;
        case "action":
          onAction?.(parsed.data.action, parsed.data.payload);
          break;
        case "error":
          console.error("Canvas iframe error:", parsed.data.message);
          break;
        case "ready":
          break;
      }
    },
    [onAction],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      style={{ width: "100%", height, border: "none" }}
      title="Canvas artifact"
    />
  );
}
