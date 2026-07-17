import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

function CanvasEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  selected,
  label,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY,
    targetX, targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{
        stroke: selected ? "var(--accent)" : "var(--text-muted)",
        strokeWidth: selected ? 2 : 1.5,
      }} />
      {label && (
        <foreignObject
          width={1}
          height={1}
          x={(sourceX + targetX) / 2}
          y={(sourceY + targetY) / 2}
          style={{ overflow: "visible" }}
        >
          <div
            style={{
              transform: "translate(-50%, -50%)",
              padding: "2px 6px",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-xs, 3px)",
              fontSize: "11px",
              color: "var(--text-dim)",
              whiteSpace: "nowrap",
              pointerEvents: "all",
            }}
          >
            {label}
          </div>
        </foreignObject>
      )}
    </>
  );
}

export default memo(CanvasEdge);
