import { ChevronDown } from "lucide-react";
import { nextLevel, type C4DiagramData, type C4Node } from "./types";

interface C4NodeRendererProps {
  node: Pick<C4Node, "id">;
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
            fontFamily: "var(--font-family-mono)",
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
  const drillChildren = nl
    ? diagramData.nodes.filter(
        (n) =>
          n.level === nl &&
          (n.parent === c4Node.label || n.parent === c4Node.id),
      )
    : [];
  const hasDrillableChildren = drillChildren.length > 0;
  const childCount = drillChildren.length;

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
        <div className="c4-node-drill-chip">
          <ChevronDown size={10} />
          <span>{childCount} {childCount === 1 ? "child" : "children"}</span>
        </div>
      )}
    </div>
  );
}
