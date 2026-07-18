import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { C4NodeRenderer } from "./C4NodeRenderer";
import { nextLevel, type C4DiagramData, type C4Node } from "./types";

interface C4FlowNodeData extends Record<string, unknown> {
  node: C4Node;
  diagramData: C4DiagramData | null;
}

// Hidden, non-connectable handles exist only so xyflow's edge machinery can
// resolve node bounds — CanvasEdge computes its own endpoints from the node
// geometry and never reads handle ids or positions.
const hiddenHandle = { visibility: "hidden" as const };

function C4FlowNode({ data, selected }: NodeProps) {
  const { node, diagramData } = data as unknown as C4FlowNodeData;

  const nl = nextLevel(node.level);
  const hasDrillableChildren =
    nl != null &&
    (diagramData?.nodes ?? []).some(
      (n) =>
        n.level === nl &&
        (n.parent === node.label || n.parent === node.id),
    );

  return (
    <div
      className={`c4-flow-node ${selected ? "c4-flow-node--selected" : ""} ${hasDrillableChildren ? "c4-flow-node--drillable" : ""}`}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: "10px 14px",
        borderRadius: "var(--radius-md, 6px)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} style={hiddenHandle} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={hiddenHandle} />
      <C4NodeRenderer node={node} diagramData={diagramData} />
    </div>
  );
}

export default memo(C4FlowNode);
