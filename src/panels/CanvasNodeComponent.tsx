import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

interface CanvasNodeData extends Record<string, unknown> {
  title: string;
  description: string;
  tags: string[];
  sources: { id: string; url: string; source_type: string }[];
  isConnectSource?: boolean;
  isConnectTarget?: boolean;
  isConnected?: boolean;
  isConnecting?: boolean;
}

function CanvasNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData;
  const [hovered, setHovered] = useState(false);
  const descSnippet = nodeData.description
    ? nodeData.description.slice(0, 80) + (nodeData.description.length > 80 ? "..." : "")
    : "";

  const handles = [
    { type: "source" as const, position: Position.Top, id: "top", className: "canvas-handle canvas-handle--top" },
    { type: "source" as const, position: Position.Right, id: "right", className: "canvas-handle canvas-handle--right" },
    { type: "source" as const, position: Position.Bottom, id: "bottom", className: "canvas-handle canvas-handle--bottom" },
    { type: "source" as const, position: Position.Left, id: "left", className: "canvas-handle canvas-handle--left" },
  ];

  return (
    <div
      className={`canvas-node ${selected ? "canvas-node--selected" : ""}`}
      data-connect-source={nodeData.isConnectSource ? "true" : undefined}
      data-connect-target={nodeData.isConnectTarget ? "true" : undefined}
      data-connected={nodeData.isConnected ? "true" : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "10px 14px",
        borderRadius: "var(--radius-md, 6px)",
        border: "1px solid var(--border)",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontSize: "13px",
        minWidth: "120px",
        minHeight: "40px",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        position: "relative",
      }}
    >
      {handles.map((h) => (
        <Handle
          key={h.id + h.type}
          type={h.type}
          position={h.position}
          id={h.id}
          className={h.className}
          style={{
            visibility: hovered ? "visible" : "hidden",
            zIndex: hovered ? 10 : 0,
          }}
        />
      ))}

      {/* Full-node drop target: lets a dragged connection land anywhere on the
          node body instead of only on a side handle. Only accepts pointer
          events while a connection is in flight, so it never blocks node
          dragging. isConnectableStart is false so a drag on the body moves the
          node rather than starting a new connection. */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        isConnectableStart={false}
        className="canvas-node-drop-target"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          transform: "none",
          borderRadius: "inherit",
          border: "none",
          background: "transparent",
          minWidth: 0,
          minHeight: 0,
          opacity: 0,
          zIndex: 5,
          pointerEvents: nodeData.isConnecting ? "all" : "none",
        }}
      />
      <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{nodeData.title || "Untitled"}</div>

      {/* Tags */}
      {nodeData.tags.length > 0 && (
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {nodeData.tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="canvas-node-tag">{tag}</span>
          ))}
          {nodeData.tags.length > 3 && (
            <span className="canvas-node-tag">+{nodeData.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Description snippet */}
      {descSnippet && (
        <div style={{ fontSize: "11px", color: "var(--text-dim)", lineHeight: 1.4 }}>{descSnippet}</div>
      )}

      {/* Source count */}
      {nodeData.sources.length > 0 && (
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
          {nodeData.sources.length} source{nodeData.sources.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

export default memo(CanvasNodeComponent);
