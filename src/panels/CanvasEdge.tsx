import { memo } from "react";
import { BaseEdge, useInternalNode, type EdgeProps } from "@xyflow/react";
import { facingSide, nodeCenter, sideHandleCenter, SIDE_NORMAL } from "../canvas/geometry";
import { computeDragRope, type RopePoint } from "../canvas/ropePhysics";

// Stitch the rope point-chain into a silky path using each consecutive pair's
// midpoint as a quadratic endpoint — the same technique the live drag rope uses.
function ropePath(pts: RopePoint[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const c = pts[i];
    const n = pts[i + 1];
    d += ` Q ${c.x} ${c.y} ${(c.x + n.x) / 2} ${(c.y + n.y) / 2}`;
  }
  const l = pts[pts.length - 1];
  d += ` T ${l.x} ${l.y}`;
  return d;
}

function CanvasEdge({ id, source, target, selected, label }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const sourceBounds = {
    x: sourceNode.internals.positionAbsolute.x,
    y: sourceNode.internals.positionAbsolute.y,
    width: sourceNode.measured.width ?? 0,
    height: sourceNode.measured.height ?? 0,
  };
  const targetBounds = {
    x: targetNode.internals.positionAbsolute.x,
    y: targetNode.internals.positionAbsolute.y,
    width: targetNode.measured.width ?? 0,
    height: targetNode.measured.height ?? 0,
  };

  // Each endpoint resolves to the side facing the other node — the connection
  // dot that visually faces the peer — recomputed every render so the edge
  // re-picks its dots as the nodes move.
  const srcSide = facingSide(sourceBounds, nodeCenter(targetBounds));
  const tgtSide = facingSide(targetBounds, nodeCenter(sourceBounds));
  const sourceDot = sideHandleCenter(sourceBounds, srcSide);
  const targetDot = sideHandleCenter(targetBounds, tgtSide);

  // The verlet drag rope at rest: the same droop shape, computed directly with
  // no physics loop. Side normals launch the curve perpendicular out of each dot.
  const pts = computeDragRope(sourceDot, targetDot, {
    sourceDir: SIDE_NORMAL[srcSide],
    targetDir: SIDE_NORMAL[tgtSide],
    launch: 0,
  });
  const edgePath = ropePath(pts);

  const labelX = (sourceDot.x + targetDot.x) / 2;
  const labelY = (sourceDot.y + targetDot.y) / 2;

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
          x={labelX}
          y={labelY}
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
