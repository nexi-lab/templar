/**
 * Main canvas renderer — dispatches artifact type to the correct
 * sub-renderer. Wraps lazy-loaded renderers in Suspense.
 */

import { Suspense } from "react";
import type { CanvasArtifact } from "../types.js";
import { HtmlRenderer } from "./html-renderer.js";
import { MarkdownRenderer } from "./markdown-renderer.js";
import { MermaidRenderer } from "./mermaid-renderer.js";

export interface CanvasRendererProps {
  readonly artifact: CanvasArtifact;
  readonly onAction?: ((action: string, payload?: unknown) => void) | undefined;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected artifact type: ${JSON.stringify(value)}`);
}

export function CanvasRenderer({ artifact, onAction }: CanvasRendererProps) {
  const { content } = artifact;

  switch (content.type) {
    case "mermaid":
      return (
        <Suspense fallback={<div>Loading diagram...</div>}>
          <MermaidRenderer content={content.content} />
        </Suspense>
      );
    case "html":
      return <HtmlRenderer content={content.content} onAction={onAction} />;
    case "markdown":
      return <MarkdownRenderer content={content.content} />;
    default:
      return assertNever(content);
  }
}
