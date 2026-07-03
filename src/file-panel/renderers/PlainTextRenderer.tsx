import { useMemo } from "react";
import { useVirtualRows } from "../virtualizer";

interface PlainTextRendererProps {
  content: string;
}

/**
 * Renders plain text content with line numbers and virtualised scrolling.
 * Used as the fallback for file types that have no specialised renderer.
 */
export function PlainTextRenderer({ content }: PlainTextRendererProps) {
  const lines = useMemo(() => content.split("\n"), [content]);

  const { totalHeight, virtualizer, scrollRef } = useVirtualRows({
    rows: lines,
    rowHeight: 20,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={scrollRef} className="file-viewer-plaintext-scroll" style={{ height: "100%", overflow: "auto" }}>
      <div style={{ height: totalHeight, position: "relative" }}>
        {virtualItems.map((vItem) => (
          <div
            key={vItem.key}
            style={{
              position: "absolute",
              top: vItem.start,
              height: vItem.size,
              width: "100%",
              display: "flex",
              fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
              fontSize: 12,
              lineHeight: "20px",
            }}
          >
            <span
              style={{
                width: 50,
                flexShrink: 0,
                textAlign: "right",
                paddingRight: 12,
                color: "var(--text-muted, #666)",
                userSelect: "none",
              }}
            >
              {vItem.index + 1}
            </span>
            <span style={{ whiteSpace: "pre" }}>{lines[vItem.index]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PlainTextRenderer;
