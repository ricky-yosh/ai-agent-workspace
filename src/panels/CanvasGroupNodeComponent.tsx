import { memo } from "react";
import { type NodeProps } from "@xyflow/react";

interface CanvasGroupData extends Record<string, unknown> {
  label: string;
  memberIds: string[];
  width?: number;
  height?: number;
}

function CanvasGroupNodeComponent({ data, selected }: NodeProps) {
  const groupData = data as unknown as CanvasGroupData;
  const w = groupData.width || 200;
  const h = groupData.height || 120;

  return (
    <div
      className={`canvas-group ${selected ? "canvas-group--selected" : ""}`}
      style={{
        width: w,
        height: h,
        borderRadius: "14px",
        border: `2px dashed ${selected ? "var(--accent)" : "var(--border)"}`,
        background: "color-mix(in oklch, var(--bg-primary), transparent 30%)",
        position: "relative",
        pointerEvents: "all",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "8px",
          left: "12px",
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--text-dim)",
          pointerEvents: "none",
        }}
      >
        {groupData.label || "Group"}
      </div>
      <div
        style={{
          position: "absolute",
          top: "8px",
          right: "12px",
          fontSize: "11px",
          color: "var(--text-muted)",
          pointerEvents: "none",
        }}
      >
        {groupData.memberIds.length}
      </div>
    </div>
  );
}

export default memo(CanvasGroupNodeComponent);
