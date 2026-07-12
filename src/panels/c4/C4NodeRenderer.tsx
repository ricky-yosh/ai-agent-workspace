import { nextLevel, type C4DiagramData } from "./types";
import type { CanvasNode } from "../../components/CanvasRenderer";

interface C4NodeRendererProps {
  node: CanvasNode;
  diagramData: C4DiagramData | null;
}

export function C4NodeRenderer({ node, diagramData }: C4NodeRendererProps) {
  if (!diagramData) return null;
  const c4Node = diagramData.nodes.find((n) => n.id === node.id);
  if (!c4Node) return null;

  if (c4Node.level === "code" && c4Node.code_snippet) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--canvas-accent-bright)",
            marginBottom: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {c4Node.label}
        </div>
        <pre
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--text-muted)",
            margin: 0,
            overflow: "hidden",
            whiteSpace: "pre",
            lineHeight: 1.3,
            flex: 1,
          }}
        >
          {c4Node.code_snippet.length > 200
            ? c4Node.code_snippet.slice(0, 200) + "..."
            : c4Node.code_snippet}
        </pre>
      </div>
    );
  }

  const nl = nextLevel(c4Node.level);
  const hasDrillableChildren =
    nl &&
    diagramData.nodes.some(
      (n) =>
        n.level === nl &&
        (n.parent === c4Node.label || n.parent === c4Node.id),
    );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          textAlign: "center",
          lineHeight: 1.3,
          wordBreak: "break-word",
        }}
      >
        {c4Node.label}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          textTransform: "capitalize",
        }}
      >
        {c4Node.type || c4Node.level}
      </div>
      {hasDrillableChildren && (
        <div
          style={{
            fontSize: 9,
            color: "var(--canvas-accent)",
            marginTop: 2,
          }}
        >
          Click to drill down
        </div>
      )}
    </div>
  );
}
