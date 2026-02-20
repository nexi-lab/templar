/**
 * Lazy-loaded Mermaid diagram renderer.
 *
 * Uses dynamic import() for mermaid.js so server-side consumers
 * never pay the bundle cost. Wrapped in React.lazy for Suspense support.
 */

import { lazy, useEffect, useId, useState } from "react";

export interface MermaidRendererProps {
  readonly content: string;
}

export const MermaidRenderer = lazy(async () => {
  const mermaidModule = await import("mermaid");
  const mermaid = mermaidModule.default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

  function MermaidRendererInner({ content }: MermaidRendererProps) {
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const reactId = useId();
    const mermaidId = `mermaid-${reactId.replace(/:/g, "")}`;

    useEffect(() => {
      let cancelled = false;
      setError(null);

      mermaid
        .render(mermaidId, content)
        .then(({ svg: renderedSvg }) => {
          if (!cancelled) setSvg(renderedSvg);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        });

      return () => {
        cancelled = true;
      };
    }, [content, mermaidId]);

    if (error) {
      return <div role="alert">Diagram error: {error}</div>;
    }

    // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid.render returns sanitized SVG
    return <div dangerouslySetInnerHTML={{ __html: svg }} />;
  }

  return { default: MermaidRendererInner };
});
